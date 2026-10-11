CREATE TABLE public.logistics_load_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  trip_id uuid NOT NULL REFERENCES public.logistics_trips(id),
  load_id uuid NOT NULL UNIQUE REFERENCES public.logistics_trip_loads(id),
  qty_delivered numeric NOT NULL CHECK (qty_delivered >= 0),
  note text, author_id uuid, delivered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.logistics_load_deliveries TO authenticated;
GRANT ALL ON public.logistics_load_deliveries TO service_role;
ALTER TABLE public.logistics_load_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read" ON public.logistics_load_deliveries FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Strict tenant country isolation" ON public.logistics_load_deliveries AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.logistics_load_deliveries FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE TRIGGER zz_audit AFTER INSERT ON public.logistics_load_deliveries FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('logistics');

CREATE OR REPLACE FUNCTION public.logistics_confirm_site(_trip uuid, _lines jsonb, _note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record; l jsonb; ld record; dest uuid; dtype text; n int := 0; q numeric; missing int;
BEGIN
  SELECT * INTO r FROM public.logistics_trips WHERE id = _trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.can_write_module(uid, 'supplies') THEN RAISE EXCEPTION 'Droit supplies requis'; END IF;
  IF r.status NOT IN ('arrived','unloading') THEN RAISE EXCEPTION 'Check-in possible uniquement à l''arrivée / au déchargement'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Aucune ligne à valider'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO ld FROM public.logistics_trip_loads WHERE id = (l->>'load_id')::uuid AND trip_id = _trip;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ligne de chargement étrangère au transport'; END IF;
    IF dtype IS NULL THEN dtype := ld.destination_type; dest := COALESCE(ld.station_id, ld.client_id);
    ELSIF dtype <> ld.destination_type OR dest <> COALESCE(ld.station_id, ld.client_id) THEN RAISE EXCEPTION 'Un check-in porte sur un seul site'; END IF;
    q := NULLIF(l->>'qty_delivered','')::numeric;
    IF q IS NULL OR q < 0 THEN RAISE EXCEPTION 'Quantité livrée invalide'; END IF;
    IF q > ld.qty_litres THEN RAISE EXCEPTION 'Quantité livrée (% L) supérieure à la capacité chargée du compartiment (% L)', q, ld.qty_litres; END IF;
    IF EXISTS (SELECT 1 FROM public.logistics_load_deliveries WHERE load_id = ld.id) THEN RAISE EXCEPTION 'Compartiment déjà livré'; END IF;
    INSERT INTO public.logistics_load_deliveries (tenant_id, country_id, trip_id, load_id, qty_delivered, note, author_id)
    VALUES (r.tenant_id, r.country_id, _trip, ld.id, q, _note, uid);
    n := n + 1;
  END LOOP;
  SELECT count(*) INTO missing FROM public.logistics_trip_loads t
   WHERE t.trip_id = _trip AND t.destination_type = dtype AND COALESCE(t.station_id, t.client_id) = dest
     AND NOT EXISTS (SELECT 1 FROM public.logistics_load_deliveries x WHERE x.load_id = t.id);
  IF missing > 0 THEN RAISE EXCEPTION 'Tous les compartiments du site doivent être validés ensemble (% manquant(s))', missing; END IF;
  IF r.status = 'arrived' THEN UPDATE public.logistics_trips SET status = 'unloading', unloading_started_at = now() WHERE id = _trip; END IF;
  INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, data, author_id)
  VALUES (_trip, r.tenant_id, r.country_id, 'site_checkin', r.status, CASE WHEN r.status='arrived' THEN 'unloading' ELSE r.status END,
    jsonb_build_object('destination_type', dtype, 'destination_id', dest, 'lines', _lines, 'note', _note), uid);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.logistics_confirm_site(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_confirm_site(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_trip_load_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tot numeric; pending int; dlv numeric;
BEGIN
  IF NEW.status = 'loaded' AND OLD.status = 'loading' THEN
    SELECT sum(qty_litres) INTO tot FROM public.logistics_trip_loads WHERE trip_id = NEW.id;
    IF tot IS NULL THEN RAISE EXCEPTION 'Plan de chargement requis (volume total, produits, destinations)'; END IF;
    NEW.qty_loaded := tot;
  END IF;
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND EXISTS (SELECT 1 FROM public.logistics_trip_loads WHERE trip_id = NEW.id) THEN
    SELECT count(*) INTO pending FROM public.logistics_trip_loads t WHERE t.trip_id = NEW.id
      AND NOT EXISTS (SELECT 1 FROM public.logistics_load_deliveries x WHERE x.load_id = t.id);
    IF pending > 0 THEN RAISE EXCEPTION 'Livraison impossible : % compartiment(s) non validé(s) sur site', pending; END IF;
    SELECT sum(qty_delivered) INTO dlv FROM public.logistics_load_deliveries WHERE trip_id = NEW.id;
    NEW.qty_delivered := dlv;
  END IF;
  RETURN NEW;
END $$;