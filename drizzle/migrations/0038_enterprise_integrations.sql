CREATE TABLE public.integration_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  category text NOT NULL CHECK (category IN ('erp','banking','mobile_money','pos','gps','atg','iot','messaging')),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  direction text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound','bidirectional')),
  config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','error','disabled')),
  has_credentials boolean NOT NULL DEFAULT false,
  credential_hint text,
  credential_updated_at timestamptz,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_connectors TO authenticated;
GRANT ALL ON public.integration_connectors TO service_role;
ALTER TABLE public.integration_connectors ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.integration_can_manage(_tenant uuid, _country uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(auth.uid()) OR (public.has_permission(auth.uid(),'integrations.manage')
    AND CASE WHEN _country IS NULL THEN public.can_access_tenant(auth.uid(),_tenant) ELSE public.can_access_tenant_country(auth.uid(),_tenant,_country) END)
$$;
GRANT EXECUTE ON FUNCTION public.integration_can_manage(uuid,uuid) TO authenticated;

CREATE POLICY "connectors read" ON public.integration_connectors FOR SELECT TO authenticated
  USING (public.integration_can_manage(tenant_id, country_id));

-- Encrypted credentials: never readable by browser roles
CREATE TABLE public.integration_credentials (
  connector_id uuid PRIMARY KEY REFERENCES public.integration_connectors(id),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  key_version int NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.integration_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES public.integration_connectors(id),
  entity text NOT NULL CHECK (entity IN ('product','station','tank','payment_method','client','unit','status','field')),
  external_value text NOT NULL,
  internal_value text NOT NULL,
  transform jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connector_id, entity, external_value)
);
GRANT SELECT ON public.integration_mappings TO authenticated;
GRANT ALL ON public.integration_mappings TO service_role;
ALTER TABLE public.integration_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mappings read" ON public.integration_mappings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.integration_connectors c WHERE c.id = connector_id));

CREATE TABLE public.integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES public.integration_connectors(id),
  job_type text NOT NULL CHECK (job_type IN ('test','pull','push')),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  params jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  last_error text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (connector_id, idempotency_key)
);
GRANT SELECT ON public.integration_sync_jobs TO authenticated;
GRANT ALL ON public.integration_sync_jobs TO service_role;
ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs read" ON public.integration_sync_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.integration_connectors c WHERE c.id = connector_id));

CREATE TABLE public.integration_sync_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connector_id uuid NOT NULL REFERENCES public.integration_connectors(id),
  job_id uuid REFERENCES public.integration_sync_jobs(id),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_sync_logs_conn ON public.integration_sync_logs(connector_id, created_at DESC);
GRANT SELECT ON public.integration_sync_logs TO authenticated;
GRANT ALL ON public.integration_sync_logs TO service_role;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs read" ON public.integration_sync_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.integration_connectors c WHERE c.id = connector_id));

CREATE OR REPLACE FUNCTION public.integration_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Opération interdite : historique d''intégration immuable'; END $$;
CREATE TRIGGER integration_sync_logs_immutable BEFORE UPDATE OR DELETE ON public.integration_sync_logs
  FOR EACH ROW EXECUTE FUNCTION public.integration_immutable();
CREATE TRIGGER integration_connectors_no_delete BEFORE DELETE ON public.integration_connectors
  FOR EACH ROW EXECUTE FUNCTION public.integration_immutable();

INSERT INTO public.permissions (code, module, action, label)
VALUES ('integrations.manage','integrations','manage','Gérer les connecteurs d''intégration')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.integration_action(_action text, _id uuid, _data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.integration_connectors; v_id uuid; v_job public.integration_sync_jobs; v_key text; v_new boolean;
BEGIN
  IF _data ? 'credentials' THEN RAISE EXCEPTION 'Les identifiants passent uniquement par le service sécurisé'; END IF;
  IF (_data->'config') IS NOT NULL AND (_data->'config')::text ~* '"(password|secret|token|api_key|apikey|private_key|client_secret)"' THEN
    RAISE EXCEPTION 'Les secrets doivent être saisis dans les identifiants sécurisés, pas dans la configuration';
  END IF;
  IF _action = 'create' THEN
    IF NOT public.integration_can_manage((_data->>'tenant_id')::uuid, NULLIF(_data->>'country_id','')::uuid) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
    IF NULLIF(_data->>'country_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_countries WHERE tenant_id=(_data->>'tenant_id')::uuid AND country_id=(_data->>'country_id')::uuid) THEN
      RAISE EXCEPTION 'Pays non rattaché à ce client';
    END IF;
    INSERT INTO public.integration_connectors(tenant_id,country_id,category,provider,name,environment,direction,config,created_by)
    VALUES ((_data->>'tenant_id')::uuid, NULLIF(_data->>'country_id','')::uuid, _data->>'category', lower(_data->>'provider'),
            _data->>'name', COALESCE(_data->>'environment','sandbox'), COALESCE(_data->>'direction','inbound'),
            COALESCE(_data->'config','{}'::jsonb), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.integration_sync_logs(connector_id,message,details) VALUES (v_id,'Connecteur créé',_data);
    PERFORM public.log_audit_event('integration.create','integrations','integration_connector',v_id::text,NULLIF(_data->>'country_id','')::uuid,_data,NULL);
    RETURN jsonb_build_object('id',v_id);
  END IF;

  SELECT * INTO c FROM public.integration_connectors WHERE id = _id;
  IF c.id IS NULL OR NOT public.integration_can_manage(c.tenant_id, c.country_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  IF _action = 'update' THEN
    UPDATE public.integration_connectors SET
      name = COALESCE(_data->>'name', name), environment = COALESCE(_data->>'environment', environment),
      direction = COALESCE(_data->>'direction', direction), config = COALESCE(_data->'config', config), updated_at = now()
    WHERE id = _id;
  ELSIF _action = 'set_status' THEN
    IF COALESCE(_data->>'status','') NOT IN ('active','paused','disabled','draft') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
    IF _data->>'status' = 'active' AND NOT c.has_credentials AND COALESCE(c.config->>'auth','required') <> 'none' THEN
      RAISE EXCEPTION 'Identifiants requis avant activation';
    END IF;
    UPDATE public.integration_connectors SET status = _data->>'status',
      consecutive_failures = CASE WHEN _data->>'status'='active' THEN 0 ELSE consecutive_failures END, updated_at = now() WHERE id = _id;
  ELSIF _action = 'set_mapping' THEN
    IF COALESCE(_data->>'external_value','') = '' OR COALESCE(_data->>'internal_value','') = '' THEN RAISE EXCEPTION 'Valeurs de mapping requises'; END IF;
    INSERT INTO public.integration_mappings(connector_id,entity,external_value,internal_value,transform)
    VALUES (_id, _data->>'entity', _data->>'external_value', _data->>'internal_value', COALESCE(_data->'transform','{}'))
    ON CONFLICT (connector_id,entity,external_value) DO UPDATE SET internal_value = EXCLUDED.internal_value, transform = EXCLUDED.transform;
  ELSIF _action = 'delete_mapping' THEN
    DELETE FROM public.integration_mappings WHERE connector_id = _id AND id = (_data->>'mapping_id')::uuid;
  ELSIF _action = 'enqueue' THEN
    IF COALESCE(_data->>'job_type','') NOT IN ('test','pull','push') THEN RAISE EXCEPTION 'Type de job invalide'; END IF;
    IF c.status <> 'active' AND _data->>'job_type' <> 'test' THEN RAISE EXCEPTION 'Connecteur non actif'; END IF;
    v_key := COALESCE(NULLIF(_data->>'idempotency_key',''), (_data->>'job_type') || ':' || to_char(now() AT TIME ZONE 'UTC','YYYYMMDDHH24MI'));
    INSERT INTO public.integration_sync_jobs(connector_id,job_type,idempotency_key,params,requested_by)
    VALUES (_id, _data->>'job_type', v_key, COALESCE(_data->'params','{}'), auth.uid())
    ON CONFLICT (connector_id,idempotency_key) DO NOTHING
    RETURNING * INTO v_job;
    v_new := v_job.id IS NOT NULL;
    IF NOT v_new THEN SELECT * INTO v_job FROM public.integration_sync_jobs WHERE connector_id = _id AND idempotency_key = v_key; END IF;
    INSERT INTO public.integration_sync_logs(connector_id,job_id,message,details) VALUES (_id,v_job.id,
      CASE WHEN v_new THEN 'Job planifié' ELSE 'Job déjà existant (idempotence)' END, jsonb_build_object('key',v_key));
    RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status, 'deduplicated', NOT v_new);
  ELSIF _action = 'retry' THEN
    UPDATE public.integration_sync_jobs SET status='pending', next_attempt_at=now(), attempts=0, last_error=NULL
    WHERE id = (_data->>'job_id')::uuid AND connector_id = _id AND status IN ('failed','dead');
    IF NOT FOUND THEN RAISE EXCEPTION 'Job non relançable'; END IF;
  ELSE RAISE EXCEPTION 'Action inconnue'; END IF;

  INSERT INTO public.integration_sync_logs(connector_id,message,details) VALUES (_id,'Action '||_action,_data);
  PERFORM public.log_audit_event('integration.'||_action,'integrations','integration_connector',_id::text,c.country_id,_data,NULL);
  RETURN jsonb_build_object('id',_id);
END $$;
REVOKE ALL ON FUNCTION public.integration_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integration_action(text,uuid,jsonb) TO authenticated;