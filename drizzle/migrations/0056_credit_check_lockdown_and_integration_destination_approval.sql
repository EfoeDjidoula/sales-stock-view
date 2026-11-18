REVOKE ALL ON FUNCTION public.b2b_check_credit(uuid,uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_check_credit(uuid,uuid,uuid,numeric) TO service_role;

ALTER TABLE public.integration_connectors
  ADD COLUMN IF NOT EXISTS approved_host text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.integration_connectors FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.integration_base_host(_config jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT lower(substring(COALESCE(_config->>'base_url','') from '^https://([^/:?#@]+)'))
$$;

CREATE OR REPLACE FUNCTION public.integration_action(_action text, _id uuid, _data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.integration_connectors; v_id uuid; v_job public.integration_sync_jobs; v_key text; v_new boolean; v_interval int; v_host text;
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
    INSERT INTO public.integration_sync_logs(connector_id,message,details) VALUES (v_id,'Connecteur créé (destination à approuver par LUMATEK)',_data);
    PERFORM public.audit_business_event('integration.create','integrations','integration_connector',v_id::text,NULLIF(_data->>'country_id','')::uuid,_data,NULL);
    RETURN jsonb_build_object('id',v_id);
  END IF;

  SELECT * INTO c FROM public.integration_connectors WHERE id = _id;
  IF c.id IS NULL OR NOT public.integration_can_manage(c.tenant_id, c.country_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  IF _action = 'update' THEN
    v_host := public.integration_base_host(COALESCE(_data->'config', c.config));
    UPDATE public.integration_connectors SET
      name = COALESCE(_data->>'name', name), environment = COALESCE(_data->>'environment', environment),
      direction = COALESCE(_data->>'direction', direction), config = COALESCE(_data->'config', config),
      approved_host = CASE WHEN v_host IS NOT DISTINCT FROM approved_host THEN approved_host ELSE NULL END,
      approved_by = CASE WHEN v_host IS NOT DISTINCT FROM approved_host THEN approved_by ELSE NULL END,
      approved_at = CASE WHEN v_host IS NOT DISTINCT FROM approved_host THEN approved_at ELSE NULL END,
      status = CASE WHEN v_host IS DISTINCT FROM approved_host AND status = 'active' THEN 'paused' ELSE status END,
      updated_at = now()
    WHERE id = _id;
  ELSIF _action = 'approve_destination' THEN
    IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Seul le Super Admin LUMATEK peut approuver une destination'; END IF;
    v_host := public.integration_base_host(c.config);
    IF v_host IS NULL OR v_host !~ '^[a-z0-9.-]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Adresse HTTPS invalide dans la configuration'; END IF;
    IF COALESCE(_data->>'host','') <> v_host THEN RAISE EXCEPTION 'La destination a changé, rechargez avant d''approuver'; END IF;
    UPDATE public.integration_connectors SET approved_host = v_host, approved_by = auth.uid(), approved_at = now(), updated_at = now() WHERE id = _id;
  ELSIF _action = 'revoke_destination' THEN
    IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Seul le Super Admin LUMATEK peut retirer une approbation'; END IF;
    UPDATE public.integration_connectors SET approved_host = NULL, approved_by = NULL, approved_at = NULL,
      status = CASE WHEN status = 'active' THEN 'paused' ELSE status END, updated_at = now() WHERE id = _id;
  ELSIF _action = 'set_status' THEN
    IF COALESCE(_data->>'status','') NOT IN ('active','paused','disabled','draft') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
    IF _data->>'status' = 'active' AND NOT c.has_credentials AND COALESCE(c.config->>'auth','required') <> 'none' THEN
      RAISE EXCEPTION 'Identifiants requis avant activation';
    END IF;
    IF _data->>'status' = 'active' AND c.approved_host IS DISTINCT FROM public.integration_base_host(c.config) THEN
      RAISE EXCEPTION 'Destination non approuvée par LUMATEK';
    END IF;
    UPDATE public.integration_connectors SET status = _data->>'status',
      consecutive_failures = CASE WHEN _data->>'status'='active' THEN 0 ELSE consecutive_failures END, updated_at = now() WHERE id = _id;
  ELSIF _action = 'set_schedule' THEN
    v_interval := NULLIF(_data->>'interval_minutes','')::int;
    IF v_interval IS NOT NULL AND v_interval NOT IN (60,120,240,360,720,1440) THEN RAISE EXCEPTION 'Intervalle invalide'; END IF;
    UPDATE public.integration_connectors SET
      sync_interval_minutes = v_interval,
      next_run_at = CASE WHEN v_interval IS NULL THEN NULL ELSE now() + make_interval(mins => v_interval) END,
      updated_at = now()
    WHERE id = _id;
    INSERT INTO public.integration_sync_logs(connector_id,message,details) VALUES (_id,
      CASE WHEN v_interval IS NULL THEN 'Planification automatique désactivée' ELSE 'Planification automatique : toutes les ' || v_interval || ' minutes' END,
      jsonb_build_object('interval_minutes', v_interval));
    PERFORM public.audit_business_event('integration.set_schedule','integrations','integration_connector',_id::text,c.country_id,jsonb_build_object('interval_minutes', v_interval),NULL);
    RETURN jsonb_build_object('id',_id,'interval_minutes',v_interval);
  ELSIF _action = 'set_mapping' THEN
    IF COALESCE(_data->>'external_value','') = '' OR COALESCE(_data->>'internal_value','') = '' THEN RAISE EXCEPTION 'Valeurs de mapping requises'; END IF;
    INSERT INTO public.integration_mappings(connector_id,entity,external_value,internal_value,transform)
    VALUES (_id, _data->>'entity', _data->>'external_value', _data->>'internal_value', COALESCE(_data->'transform','{}'))
    ON CONFLICT (connector_id,entity,external_value) DO UPDATE SET internal_value = EXCLUDED.internal_value, transform = EXCLUDED.transform;
  ELSIF _action = 'delete_mapping' THEN
    DELETE FROM public.integration_mappings WHERE connector_id = _id AND id = (_data->>'mapping_id')::uuid;
  ELSIF _action = 'enqueue' THEN
    IF COALESCE(_data->>'job_type','') NOT IN ('test','pull','push') THEN RAISE EXCEPTION 'Type de job invalide'; END IF;
    IF c.approved_host IS DISTINCT FROM public.integration_base_host(c.config) THEN RAISE EXCEPTION 'Destination non approuvée par LUMATEK'; END IF;
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
    IF c.approved_host IS DISTINCT FROM public.integration_base_host(c.config) THEN RAISE EXCEPTION 'Destination non approuvée par LUMATEK'; END IF;
    UPDATE public.integration_sync_jobs SET status='pending', next_attempt_at=now(), attempts=0, last_error=NULL
    WHERE id = (_data->>'job_id')::uuid AND connector_id = _id AND status IN ('failed','dead');
    IF NOT FOUND THEN RAISE EXCEPTION 'Job non relançable'; END IF;
  ELSE RAISE EXCEPTION 'Action inconnue'; END IF;

  INSERT INTO public.integration_sync_logs(connector_id,message,details) VALUES (_id,'Action '||_action,_data);
  PERFORM public.audit_business_event('integration.'||_action,'integrations','integration_connector',_id::text,c.country_id,_data,NULL);
  RETURN jsonb_build_object('id',_id);
END $function$;

REVOKE ALL ON FUNCTION public.integration_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integration_action(text,uuid,jsonb) TO authenticated;