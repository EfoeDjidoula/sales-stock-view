CREATE TABLE public.logistics_cmr_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  trip_id uuid NOT NULL REFERENCES public.logistics_trips(id),
  role text NOT NULL CHECK (role IN ('shipper','carrier','consignee')),
  site_key text NOT NULL DEFAULT '',
  signer_name text NOT NULL,
  signature_png text NOT NULL,
  decision text NOT NULL DEFAULT 'signed' CHECK (decision IN ('signed','accepted','accepted_with_reserves','refused')),
  reserves text,
  receipt_number text NOT NULL,
  signed_by uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, role, site_key)
);
GRANT SELECT ON public.logistics_cmr_signatures TO authenticated;
GRANT ALL ON public.logistics_cmr_signatures TO service_role;
ALTER TABLE public.logistics_cmr_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read" ON public.logistics_cmr_signatures FOR SELECT TO authenticated USING (can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Strict tenant country isolation" ON public.logistics_cmr_signatures AS RESTRICTIVE FOR ALL TO authenticated USING (can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Module gate" ON public.logistics_cmr_signatures AS RESTRICTIVE FOR ALL TO authenticated USING (is_module_enabled(tenant_id, country_id, 'livraisons')) WITH CHECK (is_module_enabled(tenant_id, country_id, 'livraisons'));

CREATE OR REPLACE FUNCTION public.logistics_cmr_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Signature e-CMR immuable'; END $$;
CREATE TRIGGER logistics_cmr_immutable BEFORE UPDATE OR DELETE ON public.logistics_cmr_signatures FOR EACH ROW EXECUTE FUNCTION public.logistics_cmr_immutable();

CREATE OR REPLACE FUNCTION public.logistics_sign_cmr(_trip uuid, _role text, _site_key text, _name text, _png text, _decision text, _reserves text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; num text; rid uuid; dec text := coalesce(_decision,'signed');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO t FROM logistics_trips WHERE id = _trip;
  IF NOT FOUND OR NOT can_access_tenant_country(auth.uid(), t.tenant_id, t.country_id) THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT is_module_enabled(t.tenant_id, t.country_id, 'livraisons') THEN RAISE EXCEPTION 'Module désactivé'; END IF;
  IF NOT tenant_write_allowed(t.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT can_write_module(auth.uid(), 'livraisons') THEN RAISE EXCEPTION 'Permission refusée'; END IF;
  IF _role NOT IN ('shipper','carrier','consignee') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN RAISE EXCEPTION 'Nom du signataire requis'; END IF;
  IF _png IS NULL OR _png NOT LIKE 'data:image/png;base64,%' OR length(_png) < 200 OR length(_png) > 400000 THEN RAISE EXCEPTION 'Signature invalide'; END IF;
  IF _role = 'consignee' THEN
    IF coalesce(_site_key,'') = '' THEN RAISE EXCEPTION 'Site destinataire requis'; END IF;
    IF dec NOT IN ('accepted','accepted_with_reserves','refused') THEN RAISE EXCEPTION 'Décision invalide'; END IF;
    IF dec <> 'accepted' AND length(trim(coalesce(_reserves,''))) < 3 THEN RAISE EXCEPTION 'Motif des réserves requis'; END IF;
    IF NOT EXISTS (SELECT 1 FROM logistics_trip_loads l WHERE l.trip_id = _trip AND l.destination_type || ':' || coalesce(l.station_id, l.client_id)::text = _site_key) THEN RAISE EXCEPTION 'Site hors plan de chargement'; END IF;
    IF EXISTS (SELECT 1 FROM logistics_trip_loads l WHERE l.trip_id = _trip AND l.destination_type || ':' || coalesce(l.station_id, l.client_id)::text = _site_key
               AND NOT EXISTS (SELECT 1 FROM logistics_load_deliveries d WHERE d.load_id = l.id)) THEN RAISE EXCEPTION 'Validez d''abord la livraison de ce site'; END IF;
  ELSE dec := 'signed'; _site_key := ''; END IF;
  num := 'AR-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6));
  INSERT INTO logistics_cmr_signatures(tenant_id,country_id,trip_id,role,site_key,signer_name,signature_png,decision,reserves,receipt_number,signed_by)
  VALUES (t.tenant_id,t.country_id,_trip,_role,_site_key,trim(_name),_png,dec,nullif(trim(coalesce(_reserves,'')),''),num,auth.uid()) RETURNING id INTO rid;
  PERFORM log_audit_event('ecmr_sign','livraisons','logistics_trip',_trip::text,t.country_id,jsonb_build_object('role',_role,'site',_site_key,'decision',dec,'receipt',num),NULL);
  RETURN jsonb_build_object('id',rid,'receipt_number',num);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Déjà signé pour ce rôle';
END $$;
REVOKE ALL ON FUNCTION public.logistics_sign_cmr(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_sign_cmr(uuid,text,text,text,text,text,text) TO authenticated;