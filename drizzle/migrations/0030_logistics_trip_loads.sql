ALTER TABLE public.logistics_trips ADD COLUMN IF NOT EXISTS load_mode text NOT NULL DEFAULT 'mono' CHECK (load_mode IN ('mono','mixed'));
ALTER TABLE public.logistics_vehicles ADD COLUMN IF NOT EXISTS legacy_truck_id uuid;

CREATE TABLE public.logistics_trip_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  trip_id uuid NOT NULL REFERENCES public.logistics_trips(id),
  compartment_id uuid REFERENCES public.logistics_compartments(id),
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  qty_litres numeric NOT NULL CHECK (qty_litres > 0),
  destination_type text NOT NULL CHECK (destination_type IN ('station','client')),
  station_id uuid REFERENCES public.stations(id),
  client_id uuid REFERENCES public.clients(id),
  stop_order integer NOT NULL DEFAULT 1 CHECK (stop_order > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((destination_type='station' AND station_id IS NOT NULL) OR (destination_type='client' AND client_id IS NOT NULL))
);
GRANT SELECT ON public.logistics_trip_loads TO authenticated;
GRANT ALL ON public.logistics_trip_loads TO service_role;
ALTER TABLE public.logistics_trip_loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read" ON public.logistics_trip_loads FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Strict tenant country isolation" ON public.logistics_trip_loads AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Module gate" ON public.logistics_trip_loads AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, 'livraisons')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'livraisons'));
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON public.logistics_trip_loads FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('logistics');

CREATE OR REPLACE FUNCTION public.logistics_set_loads(_trip uuid, _mode text, _lines jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); r record; veh uuid; cap numeric; tot numeric := 0; l jsonb; c record; nprod int; n int := 0;
BEGIN
  SELECT * INTO r FROM public.logistics_trips WHERE id = _trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.can_write_module(uid, 'supplies') THEN RAISE EXCEPTION 'Droit supplies requis'; END IF;
  IF r.status NOT IN ('planned','loading') THEN RAISE EXCEPTION 'Plan de chargement figé après le chargement'; END IF;
  IF _mode NOT IN ('mono','mixed') THEN RAISE EXCEPTION 'Mode de chargement invalide'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'Plan de chargement vide'; END IF;
  veh := COALESCE(r.tanker_id, r.truck_id);
  IF veh IS NULL THEN RAISE EXCEPTION 'Aucun camion / citerne affecté'; END IF;

  DELETE FROM public.logistics_trip_loads WHERE trip_id = _trip;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF NULLIF(l->>'compartment_id','') IS NOT NULL THEN
      SELECT * INTO c FROM public.logistics_compartments WHERE id = (l->>'compartment_id')::uuid AND vehicle_id = veh;
      IF NOT FOUND THEN RAISE EXCEPTION 'Compartiment étranger au véhicule'; END IF;
      IF (l->>'qty_litres')::numeric <> c.capacity_litres THEN RAISE EXCEPTION 'Compartiment % non chargé à pleine capacité (% L)', c.position, c.capacity_litres; END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.petroleum_products p WHERE p.id = (l->>'product_id')::uuid AND p.tenant_id = r.tenant_id AND p.country_id = r.country_id) THEN RAISE EXCEPTION 'Produit hors périmètre'; END IF;
    IF l->>'destination_type' = 'station' AND NOT EXISTS (SELECT 1 FROM public.stations s WHERE s.id = (l->>'station_id')::uuid AND s.tenant_id = r.tenant_id AND s.country_id = r.country_id) THEN RAISE EXCEPTION 'Station hors périmètre'; END IF;
    IF l->>'destination_type' = 'client' AND NOT EXISTS (SELECT 1 FROM public.clients s WHERE s.id = (l->>'client_id')::uuid AND s.tenant_id = r.tenant_id) THEN RAISE EXCEPTION 'Client hors périmètre'; END IF;
    INSERT INTO public.logistics_trip_loads (tenant_id, country_id, trip_id, compartment_id, product_id, qty_litres, destination_type, station_id, client_id, stop_order)
    VALUES (r.tenant_id, r.country_id, _trip, NULLIF(l->>'compartment_id','')::uuid, (l->>'product_id')::uuid, (l->>'qty_litres')::numeric,
      l->>'destination_type', CASE WHEN l->>'destination_type'='station' THEN (l->>'station_id')::uuid END,
      CASE WHEN l->>'destination_type'='client' THEN (l->>'client_id')::uuid END, COALESCE(NULLIF(l->>'stop_order','')::int, 1));
    tot := tot + (l->>'qty_litres')::numeric; n := n + 1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.logistics_compartments WHERE vehicle_id = veh) THEN
    SELECT sum(capacity_litres) INTO cap FROM public.logistics_compartments WHERE vehicle_id = veh;
    IF EXISTS (SELECT compartment_id FROM public.logistics_trip_loads WHERE trip_id = _trip GROUP BY compartment_id HAVING count(*) > 1 OR compartment_id IS NULL) THEN
      RAISE EXCEPTION 'Chaque compartiment doit recevoir une seule ligne (un produit, une destination)'; END IF;
  ELSE
    SELECT capacity_litres INTO cap FROM public.logistics_vehicles WHERE id = veh;
  END IF;
  IF cap IS NULL OR cap <= 0 THEN RAISE EXCEPTION 'Capacité du véhicule non configurée'; END IF;
  IF tot <> cap THEN RAISE EXCEPTION 'Le camion doit être chargé à son volume total : % L prévus pour % L de capacité', tot, cap; END IF;
  SELECT count(DISTINCT product_id) INTO nprod FROM public.logistics_trip_loads WHERE trip_id = _trip;
  IF _mode = 'mono' AND nprod > 1 THEN RAISE EXCEPTION 'Mode mono-produit : un seul produit autorisé'; END IF;

  UPDATE public.logistics_trips SET load_mode = _mode WHERE id = _trip;
  INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, data, author_id)
  VALUES (_trip, r.tenant_id, r.country_id, 'load_plan', r.status, r.status, jsonb_build_object('mode', _mode, 'total', tot, 'lines', _lines), uid);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.logistics_set_loads(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_set_loads(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.logistics_trip_load_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tot numeric;
BEGIN
  IF NEW.status = 'loaded' AND OLD.status = 'loading' THEN
    SELECT sum(qty_litres) INTO tot FROM public.logistics_trip_loads WHERE trip_id = NEW.id;
    IF tot IS NULL THEN RAISE EXCEPTION 'Plan de chargement requis (volume total, produits, destinations)'; END IF;
    NEW.qty_loaded := tot;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER load_guard BEFORE UPDATE ON public.logistics_trips FOR EACH ROW EXECUTE FUNCTION public.logistics_trip_load_guard();

CREATE OR REPLACE FUNCTION public.logistics_loads_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.logistics_trips t WHERE t.id = OLD.trip_id AND t.status NOT IN ('planned','loading')) THEN
    RAISE EXCEPTION 'Plan de chargement figé'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER loads_lock BEFORE UPDATE OR DELETE ON public.logistics_trip_loads FOR EACH ROW EXECUTE FUNCTION public.logistics_loads_lock();

INSERT INTO public.logistics_vehicles (tenant_id, country_id, kind, registration, capacity_litres, notes, legacy_truck_id)
SELECT t.tenant_id, t.country_id, 'truck', t.registration, t.nominal_capacity, concat_ws(' — ', 'Chauffeur : ' || t.driver_name, t.notes), t.id
FROM public.trucks t WHERE t.tenant_id IS NOT NULL AND t.country_id IS NOT NULL
ON CONFLICT (tenant_id, country_id, registration) DO NOTHING;
INSERT INTO public.logistics_compartments (tenant_id, country_id, vehicle_id, position, capacity_litres)
SELECT v.tenant_id, v.country_id, v.id, c.ord::int, c.cap::numeric
FROM public.logistics_vehicles v JOIN public.trucks t ON t.id = v.legacy_truck_id,
LATERAL jsonb_array_elements_text(to_jsonb(t.compartments)) WITH ORDINALITY AS c(cap, ord)
WHERE c.cap::numeric > 0
ON CONFLICT (vehicle_id, position) DO NOTHING;
COMMENT ON TABLE public.trucks IS 'LEGACY: absorbé par logistics_vehicles (encore lu par les dépotages)';