CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  integration text,
  prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  allowed_countries uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  rate_limit_per_minute int NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  expires_at timestamptz,
  rotated_from uuid REFERENCES public.api_keys(id),
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text
);
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys platform read" ON public.api_keys FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.api_request_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key_id uuid REFERENCES public.api_keys(id),
  tenant_id uuid,
  api_version text NOT NULL DEFAULT 'v1',
  method text NOT NULL,
  endpoint text NOT NULL,
  status_code int NOT NULL,
  duration_ms int,
  rows_returned int,
  error text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_request_logs_key_time ON public.api_request_logs(api_key_id, created_at DESC);
CREATE INDEX api_request_logs_time ON public.api_request_logs(created_at DESC);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_logs platform read" ON public.api_request_logs FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL,
  url text NOT NULL CHECK (url ~ '^https://'),
  events text[] NOT NULL DEFAULT '{}',
  allowed_countries uuid[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_endpoints TO service_role;
GRANT SELECT (id, tenant_id, name, url, events, allowed_countries, status, created_by, created_at) ON public.webhook_endpoints TO authenticated;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhooks platform read" ON public.webhook_endpoints FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id),
  tenant_id uuid NOT NULL,
  country_id uuid,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts int NOT NULL DEFAULT 0,
  response_code int,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_pending ON public.webhook_deliveries(status, next_attempt_at);
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries platform read" ON public.webhook_deliveries FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Admin RPCs
CREATE OR REPLACE FUNCTION public.api_key_create(_tenant uuid, _name text, _integration text, _scopes text[], _countries uuid[], _rate int, _expires timestamptz, _rotated_from uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE raw text; pre text; nid uuid; bad uuid;
  allowed text[] := ARRAY['stations:read','products:read','stocks:read','sales:read','orders:read','deliveries:read','fuelcards:read','b2b:read','reports:read'];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Nom requis'; END IF;
  IF _scopes IS NULL OR cardinality(_scopes) = 0 OR NOT (_scopes <@ allowed) THEN RAISE EXCEPTION 'Scopes invalides'; END IF;
  IF _countries IS NULL OR cardinality(_countries) = 0 THEN RAISE EXCEPTION 'Au moins un pays requis'; END IF;
  SELECT c INTO bad FROM unnest(_countries) c WHERE NOT EXISTS (SELECT 1 FROM tenant_countries tc WHERE tc.tenant_id=_tenant AND tc.country_id=c AND tc.is_active) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Pays non actif pour ce client'; END IF;
  raw := 'lmtk_live_' || encode(gen_random_bytes(24), 'hex');
  pre := left(raw, 18);
  INSERT INTO api_keys(tenant_id,name,integration,prefix,key_hash,scopes,allowed_countries,rate_limit_per_minute,expires_at,rotated_from,created_by)
  VALUES (_tenant, trim(_name), nullif(trim(_integration),''), pre, encode(digest(raw,'sha256'),'hex'), _scopes, _countries, coalesce(_rate,60), _expires, _rotated_from, auth.uid())
  RETURNING id INTO nid;
  PERFORM public.log_audit_event('api_key.create','api_hub','api_key',nid::text,NULL,jsonb_build_object('tenant',_tenant,'scopes',_scopes,'prefix',pre),NULL);
  RETURN jsonb_build_object('id',nid,'key',raw,'prefix',pre);
END $$;

CREATE OR REPLACE FUNCTION public.api_key_revoke(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF coalesce(trim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif requis'; END IF;
  UPDATE api_keys SET status='revoked', revoked_at=now(), revoked_by=auth.uid(), revoke_reason=_reason WHERE id=_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clé introuvable ou déjà révoquée'; END IF;
  PERFORM public.log_audit_event('api_key.revoke','api_hub','api_key',_id::text,NULL,jsonb_build_object('reason',_reason),NULL);
END $$;

-- Rotation: new key, old key stays valid during grace (hours) then expires
CREATE OR REPLACE FUNCTION public.api_key_rotate(_id uuid, _grace_hours int DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k api_keys; res jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO k FROM api_keys WHERE id=_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Clé introuvable ou révoquée'; END IF;
  res := public.api_key_create(k.tenant_id, k.name, k.integration, k.scopes, k.allowed_countries, k.rate_limit_per_minute, k.expires_at, k.id);
  UPDATE api_keys SET expires_at = LEAST(coalesce(expires_at, 'infinity'), now() + make_interval(hours => greatest(0, least(coalesce(_grace_hours,24), 168)))) WHERE id=_id;
  PERFORM public.log_audit_event('api_key.rotate','api_hub','api_key',_id::text,NULL,jsonb_build_object('new_key',res->>'id','grace_hours',_grace_hours),NULL);
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.webhook_create(_tenant uuid, _name text, _url text, _events text[], _countries uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s text; nid uuid;
  allowed text[] := ARRAY['closure.validated','closure.reopened','supply.received','stock.movement','fraud.alert','webhook.test'];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _url !~ '^https://' THEN RAISE EXCEPTION 'URL https requise'; END IF;
  IF _events IS NULL OR cardinality(_events)=0 OR NOT (_events <@ allowed) THEN RAISE EXCEPTION 'Événements invalides'; END IF;
  IF _countries IS NULL OR cardinality(_countries)=0 THEN RAISE EXCEPTION 'Au moins un pays requis'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_countries) c WHERE NOT EXISTS (SELECT 1 FROM tenant_countries tc WHERE tc.tenant_id=_tenant AND tc.country_id=c AND tc.is_active)) THEN RAISE EXCEPTION 'Pays non actif pour ce client'; END IF;
  s := 'whsec_' || encode(gen_random_bytes(24),'hex');
  INSERT INTO webhook_endpoints(tenant_id,name,url,events,allowed_countries,secret,created_by) VALUES (_tenant,trim(_name),_url,_events,_countries,s,auth.uid()) RETURNING id INTO nid;
  PERFORM public.log_audit_event('webhook.create','api_hub','webhook',nid::text,NULL,jsonb_build_object('tenant',_tenant,'url',_url,'events',_events),NULL);
  RETURN jsonb_build_object('id',nid,'secret',s);
END $$;

CREATE OR REPLACE FUNCTION public.webhook_set_status(_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE webhook_endpoints SET status=_status WHERE id=_id;
  PERFORM public.log_audit_event('webhook.'||_status,'api_hub','webhook',_id::text,NULL,'{}'::jsonb,NULL);
END $$;

CREATE OR REPLACE FUNCTION public.webhook_enqueue(_tenant uuid, _country uuid, _event text, _payload jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO webhook_deliveries(endpoint_id,tenant_id,country_id,event,payload)
  SELECT e.id, _tenant, _country, _event, jsonb_build_object('event',_event,'api_version','v1','created_at',now(),'data',_payload)
  FROM webhook_endpoints e
  WHERE e.tenant_id=_tenant AND e.status='active' AND _event = ANY(e.events)
    AND (_country IS NULL OR _country = ANY(e.allowed_countries));
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.webhook_enqueue(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.webhook_closure_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'validated' THEN
    PERFORM webhook_enqueue(NEW.tenant_id, NEW.country_id, 'closure.validated', jsonb_build_object('closure_id',NEW.id,'station_id',NEW.station_id,'date',NEW.closure_date,'total_volume',NEW.total_volume,'total_amount',NEW.total_amount));
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'validated' THEN
    PERFORM webhook_enqueue(NEW.tenant_id, NEW.country_id, 'closure.reopened', jsonb_build_object('closure_id',NEW.id,'station_id',NEW.station_id,'date',NEW.closure_date,'reason',NEW.last_reason));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER webhook_closure AFTER UPDATE ON public.daily_closures FOR EACH ROW EXECUTE FUNCTION public.webhook_closure_trigger();

CREATE OR REPLACE FUNCTION public.webhook_supply_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.stock_movement_id IS NOT NULL AND OLD.stock_movement_id IS NULL THEN
    PERFORM webhook_enqueue(NEW.tenant_id, NEW.country_id, 'supply.received', jsonb_build_object('supply_request_id',NEW.id,'reference',NEW.reference,'station_id',NEW.station_id,'product_id',NEW.product_id,'qty_received',NEW.qty_received,'variance',NEW.delivery_variance));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER webhook_supply AFTER UPDATE ON public.supply_requests FOR EACH ROW EXECUTE FUNCTION public.webhook_supply_trigger();

CREATE OR REPLACE FUNCTION public.webhook_fraud_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM webhook_enqueue(NEW.tenant_id, NEW.country_id, 'fraud.alert', to_jsonb(NEW) - 'details');
  RETURN NEW;
END $$;
CREATE TRIGGER webhook_fraud AFTER INSERT ON public.fraud_alerts FOR EACH ROW EXECUTE FUNCTION public.webhook_fraud_trigger();

CREATE OR REPLACE FUNCTION public.webhook_test(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e webhook_endpoints;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO e FROM webhook_endpoints WHERE id=_id;
  INSERT INTO webhook_deliveries(endpoint_id,tenant_id,event,payload)
  VALUES (e.id, e.tenant_id, 'webhook.test', jsonb_build_object('event','webhook.test','api_version','v1','created_at',now(),'data',jsonb_build_object('message','ping')));
END $$;