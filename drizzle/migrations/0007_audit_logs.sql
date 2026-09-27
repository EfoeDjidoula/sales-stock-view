CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid,
  country_id uuid,
  user_id uuid,
  user_name text,
  action text NOT NULL,
  module text NOT NULL,
  entity_type text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  session_id text
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs(created_at DESC);
CREATE INDEX audit_logs_tenant_idx ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX audit_logs_user_idx ON public.audit_logs(user_id, created_at DESC);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Immutabilité : aucune modification ni suppression
CREATE OR REPLACE FUNCTION public.audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''audit est immuable';
END $$;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();

CREATE OR REPLACE FUNCTION public.audit_request_meta(OUT ip text, OUT ua text, OUT sid text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE h json; c json;
BEGIN
  BEGIN h := nullif(current_setting('request.headers', true), '')::json; EXCEPTION WHEN others THEN h := NULL; END;
  BEGIN c := nullif(current_setting('request.jwt.claims', true), '')::json; EXCEPTION WHEN others THEN c := NULL; END;
  ip := split_part(coalesce(h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1);
  IF ip = '' THEN ip := NULL; END IF;
  ua := h->>'user-agent';
  sid := c->>'session_id';
END $$;

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; ov jsonb; nv jsonb; k text; r jsonb;
  m record; uid uuid := auth.uid(); uname text; act text;
  _tenant uuid; _country uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN n := to_jsonb(NEW); nv := n; act := 'create';
  ELSIF TG_OP = 'DELETE' THEN o := to_jsonb(OLD); ov := o; act := 'delete';
  ELSE
    o := to_jsonb(OLD); n := to_jsonb(NEW); ov := '{}'; nv := '{}'; act := 'update';
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at') AND (o->k) IS DISTINCT FROM (n->k) THEN
        ov := ov || jsonb_build_object(k, o->k); nv := nv || jsonb_build_object(k, n->k);
      END IF;
    END LOOP;
    IF nv = '{}'::jsonb THEN RETURN NEW; END IF;
    IF nv ? 'status' THEN act := 'status:' || coalesce(nv->>'status','');
    ELSIF nv ? 'is_active' THEN act := CASE WHEN (nv->>'is_active')::boolean THEN 'activate' ELSE 'suspend' END;
    ELSIF nv ? 'is_enabled' THEN act := CASE WHEN (nv->>'is_enabled')::boolean THEN 'enable' ELSE 'disable' END;
    END IF;
  END IF;
  r := coalesce(n, o);
  _tenant := CASE WHEN TG_TABLE_NAME = 'tenants' THEN (r->>'id')::uuid ELSE nullif(r->>'tenant_id','')::uuid END;
  _country := nullif(r->>'country_id','')::uuid;
  IF _tenant IS NULL AND uid IS NOT NULL THEN _tenant := public.get_user_tenant(uid); END IF;
  SELECT full_name INTO uname FROM public.profiles WHERE user_id = uid LIMIT 1;
  SELECT * INTO m FROM public.audit_request_meta();
  INSERT INTO public.audit_logs(tenant_id, country_id, user_id, user_name, action, module, entity_type, entity_id, old_value, new_value, ip_address, user_agent, session_id)
  VALUES (_tenant, _country, uid, uname, act, coalesce(TG_ARGV[0], TG_TABLE_NAME), TG_TABLE_NAME, r->>'id', ov, nv, m.ip, m.ua, m.sid);
  RETURN coalesce(NEW, OLD);
END $$;

DO $$
DECLARE t text[]; BEGIN
  FOREACH t SLICE 1 IN ARRAY ARRAY[
    ['profiles','utilisateurs'],['user_roles','utilisateurs'],['user_country_access','utilisateurs'],['station_assignments','utilisateurs'],['platform_admins','utilisateurs'],
    ['roles','permissions'],['role_permissions','permissions'],['user_role_assignments','permissions'],
    ['stations','stations'],['tanks','stations'],['pumps','stations'],
    ['price_structures','prix'],['perequation_rates','prix'],
    ['depotages','stock'],['supplies','stock'],['orders','achats'],
    ['index_entries','index'],['fiscal_years','validations'],
    ['tenant_modules','modules'],['country_modules','modules'],
    ['licenses','licences'],['license_plans','licences'],['license_modules','licences'],['maintenance_contracts','contrats'],
    ['tenants','parametres'],['tenant_countries','parametres'],['tenant_branding','parametres'],['countries','parametres']
  ] LOOP
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(%L)', t[1], t[2]);
  END LOOP;
END $$;

-- Événements applicatifs (connexion, déconnexion, changement de pays, exports…)
CREATE OR REPLACE FUNCTION public.log_audit_event(_action text, _module text, _entity_type text DEFAULT NULL, _entity_id text DEFAULT NULL, _country_id uuid DEFAULT NULL, _details jsonb DEFAULT NULL, _device text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m record; uname text; _tenant uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF _action NOT IN ('login','logout','country_switch','export','view_sensitive') THEN RAISE EXCEPTION 'Action non autorisée'; END IF;
  SELECT full_name, tenant_id INTO uname, _tenant FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF _country_id IS NOT NULL AND NOT public.can_access_tenant_country(uid, _tenant, _country_id) THEN _country_id := NULL; END IF;
  SELECT * INTO m FROM public.audit_request_meta();
  INSERT INTO public.audit_logs(tenant_id, country_id, user_id, user_name, action, module, entity_type, entity_id, new_value, ip_address, user_agent, session_id)
  VALUES (_tenant, _country_id, uid, uname, _action, left(_module,50), left(_entity_type,50), left(_entity_id,100), _details, m.ip, coalesce(left(_device,300), m.ua), m.sid);
END $$;
REVOKE ALL ON FUNCTION public.log_audit_event(text,text,text,text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text,text,text,text,uuid,jsonb,text) TO authenticated;