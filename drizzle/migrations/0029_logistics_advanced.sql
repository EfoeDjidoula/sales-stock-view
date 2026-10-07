CREATE TABLE public.logistics_carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  name text NOT NULL, code text, phone text, email text, address text,
  is_internal boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.logistics_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  carrier_id uuid REFERENCES public.logistics_carriers(id),
  kind text NOT NULL CHECK (kind IN ('truck','tractor','tanker')),
  registration text NOT NULL, brand text, model text, vin text,
  capacity_litres numeric CHECK (capacity_litres >= 0),
  gps_device_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, registration)
);
CREATE TABLE public.logistics_compartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  vehicle_id uuid NOT NULL REFERENCES public.logistics_vehicles(id),
  position integer NOT NULL CHECK (position > 0),
  capacity_litres numeric NOT NULL CHECK (capacity_litres > 0),
  calibration_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, position)
);
CREATE TABLE public.logistics_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  carrier_id uuid REFERENCES public.logistics_carriers(id),
  full_name text NOT NULL, license_number text, phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.logistics_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  entity_type text NOT NULL CHECK (entity_type IN ('vehicle','driver')),
  vehicle_id uuid REFERENCES public.logistics_vehicles(id),
  driver_id uuid REFERENCES public.logistics_drivers(id),
  doc_type text NOT NULL,
  doc_number text, issued_on date, expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((entity_type='vehicle' AND vehicle_id IS NOT NULL AND driver_id IS NULL) OR (entity_type='driver' AND driver_id IS NOT NULL AND vehicle_id IS NULL))
);
CREATE TABLE public.logistics_seals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  serial text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','intact','broken','anomaly','void')),
  trip_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, serial)
);
CREATE TABLE public.logistics_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  reference text,
  supply_request_id uuid REFERENCES public.supply_requests(id),
  carrier_id uuid REFERENCES public.logistics_carriers(id),
  truck_id uuid REFERENCES public.logistics_vehicles(id),
  tanker_id uuid REFERENCES public.logistics_vehicles(id),
  driver_id uuid REFERENCES public.logistics_drivers(id),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','loading','loaded','in_transit','arrived','unloading','delivered','incident')),
  planned_departure timestamptz, eta timestamptz,
  loading_started_at timestamptz, loaded_at timestamptz, departed_at timestamptz, arrived_at timestamptz,
  unloading_started_at timestamptz, delivered_at timestamptz,
  qty_loaded numeric CHECK (qty_loaded >= 0), qty_delivered numeric CHECK (qty_delivered >= 0),
  tolerance_pct numeric NOT NULL DEFAULT 0.5 CHECK (tolerance_pct >= 0),
  incident_note text,
  last_position jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.logistics_trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.logistics_trips(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  action text NOT NULL, from_status text, to_status text, reason text, data jsonb,
  author_id uuid, author_name text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.logistics_gps_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id),
  trip_id uuid REFERENCES public.logistics_trips(id),
  vehicle_id uuid REFERENCES public.logistics_vehicles(id),
  latitude numeric NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed_kmh numeric, heading numeric, odometer_km numeric,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','mobile','gps_provider')),
  provider text, raw jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.logistics_carriers, public.logistics_vehicles, public.logistics_compartments, public.logistics_drivers, public.logistics_documents, public.logistics_seals TO authenticated;
GRANT SELECT ON public.logistics_trips, public.logistics_trip_events, public.logistics_gps_positions TO authenticated;
GRANT ALL ON public.logistics_carriers, public.logistics_vehicles, public.logistics_compartments, public.logistics_drivers, public.logistics_documents, public.logistics_seals, public.logistics_trips, public.logistics_trip_events, public.logistics_gps_positions TO service_role;

CREATE OR REPLACE FUNCTION public.logistics_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Suppression interdite : désactivez l''élément'; END $$;
CREATE OR REPLACE FUNCTION public.logistics_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historique immuable'; END $$;
CREATE OR REPLACE FUNCTION public.logistics_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); NEW.tenant_id := OLD.tenant_id; NEW.country_id := OLD.country_id; RETURN NEW; END $$;

ALTER TABLE public.logistics_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_compartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_gps_positions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['logistics_carriers','logistics_vehicles','logistics_compartments','logistics_drivers','logistics_documents','logistics_seals','logistics_trips','logistics_trip_events','logistics_gps_positions'] LOOP
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''livraisons'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''livraisons''))', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''logistics'')', t);
    EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.logistics_no_delete()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['logistics_carriers','logistics_vehicles','logistics_compartments','logistics_drivers','logistics_documents','logistics_seals'] LOOP
    EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''supplies''))', t);
    EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''supplies''))', t);
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    IF t <> 'logistics_compartments' THEN
      EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.logistics_touch()', t);
    END IF;
  END LOOP;
END $$;
CREATE TRIGGER immutable BEFORE UPDATE ON public.logistics_trip_events FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE TRIGGER immutable BEFORE UPDATE ON public.logistics_gps_positions FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();

CREATE OR REPLACE FUNCTION public.logistics_trip_action(_id uuid, _action text, _reason text DEFAULT NULL, _data jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data,'{}'::jsonb); r record; sr record;
  tid uuid; cid uuid; new_status text; old_status text; n numeric; s uuid;
  nxt jsonb := '{"start_loading":["planned","loading"],"finish_loading":["loading","loaded"],"depart":["loaded","in_transit"],"arrive":["in_transit","arrived"],"start_unloading":["arrived","unloading"],"deliver":["unloading","delivered"]}';
BEGIN
  IF _action = 'create' THEN
    tid := (d->>'tenant_id')::uuid; cid := (d->>'country_id')::uuid;
    IF d ? 'supply_request_id' AND d->>'supply_request_id' <> '' THEN
      SELECT * INTO sr FROM public.supply_requests WHERE id = (d->>'supply_request_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Approvisionnement introuvable'; END IF;
      tid := sr.tenant_id; cid := sr.country_id;
    END IF;
  ELSE
    SELECT * INTO r FROM public.logistics_trips WHERE id = _id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
    tid := r.tenant_id; cid := r.country_id; old_status := r.status;
  END IF;
  IF tid IS NULL OR NOT public.can_access_tenant_country(uid, tid, cid) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(tid) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.is_module_enabled(tid, cid, 'livraisons') THEN RAISE EXCEPTION 'Module Livraisons désactivé'; END IF;
  IF NOT public.can_write_module(uid, 'supplies') THEN RAISE EXCEPTION 'Droit supplies.create requis'; END IF;

  IF _action = 'create' THEN
    -- Équipements du même périmètre
    IF EXISTS (SELECT 1 FROM public.logistics_vehicles v WHERE v.id IN (NULLIF(d->>'truck_id','')::uuid, NULLIF(d->>'tanker_id','')::uuid) AND (v.tenant_id <> tid OR v.country_id <> cid OR v.status <> 'active'))
       OR EXISTS (SELECT 1 FROM public.logistics_drivers x WHERE x.id = NULLIF(d->>'driver_id','')::uuid AND (x.tenant_id <> tid OR x.country_id <> cid OR x.status <> 'active')) THEN
      RAISE EXCEPTION 'Véhicule ou chauffeur inactif ou hors périmètre';
    END IF;
    IF EXISTS (SELECT 1 FROM public.logistics_documents doc WHERE doc.expires_on < current_date AND
       (doc.vehicle_id IN (NULLIF(d->>'truck_id','')::uuid, NULLIF(d->>'tanker_id','')::uuid) OR doc.driver_id = NULLIF(d->>'driver_id','')::uuid)) THEN
      RAISE EXCEPTION 'Document expiré sur le véhicule ou le chauffeur : affectation refusée';
    END IF;
    INSERT INTO public.logistics_trips (tenant_id, country_id, supply_request_id, carrier_id, truck_id, tanker_id, driver_id, planned_departure, eta, tolerance_pct, created_by)
    VALUES (tid, cid, NULLIF(d->>'supply_request_id','')::uuid, NULLIF(d->>'carrier_id','')::uuid, NULLIF(d->>'truck_id','')::uuid,
      NULLIF(d->>'tanker_id','')::uuid, NULLIF(d->>'driver_id','')::uuid, NULLIF(d->>'planned_departure','')::timestamptz,
      NULLIF(d->>'eta','')::timestamptz, COALESCE(NULLIF(d->>'tolerance_pct','')::numeric, 0.5), uid)
    RETURNING id INTO _id;
    UPDATE public.logistics_trips SET reference = 'TRP-' || to_char(now(),'YYYYMMDD') || '-' || upper(left(_id::text,6)) WHERE id = _id;
    new_status := 'planned';
  ELSIF nxt ? _action THEN
    IF old_status <> nxt->_action->>0 THEN RAISE EXCEPTION 'Étape impossible depuis le statut %', old_status; END IF;
    new_status := nxt->_action->>1;
    IF _action = 'start_loading' THEN UPDATE public.logistics_trips SET loading_started_at = now() WHERE id = _id;
    ELSIF _action = 'finish_loading' THEN
      n := NULLIF(d->>'qty_loaded','')::numeric;
      IF n IS NULL OR n <= 0 THEN RAISE EXCEPTION 'Quantité chargée obligatoire'; END IF;
      UPDATE public.logistics_trips SET qty_loaded = n, loaded_at = now() WHERE id = _id;
      IF jsonb_typeof(d->'seal_ids') = 'array' THEN
        FOR s IN SELECT (jsonb_array_elements_text(d->'seal_ids'))::uuid LOOP
          UPDATE public.logistics_seals SET status = 'assigned', trip_id = _id WHERE id = s AND tenant_id = tid AND country_id = cid AND status = 'available';
          IF NOT FOUND THEN RAISE EXCEPTION 'Scellé indisponible'; END IF;
        END LOOP;
      END IF;
    ELSIF _action = 'depart' THEN UPDATE public.logistics_trips SET departed_at = now(), eta = COALESCE(NULLIF(d->>'eta','')::timestamptz, eta) WHERE id = _id;
    ELSIF _action = 'arrive' THEN UPDATE public.logistics_trips SET arrived_at = now() WHERE id = _id;
    ELSIF _action = 'start_unloading' THEN
      UPDATE public.logistics_seals SET status = CASE WHEN COALESCE((d->>'seals_intact')::boolean, true) THEN 'intact' ELSE 'broken' END
      WHERE trip_id = _id AND status = 'assigned';
      UPDATE public.logistics_trips SET unloading_started_at = now() WHERE id = _id;
    ELSIF _action = 'deliver' THEN
      n := NULLIF(d->>'qty_delivered','')::numeric;
      IF n IS NULL OR n <= 0 THEN RAISE EXCEPTION 'Quantité livrée obligatoire'; END IF;
      UPDATE public.logistics_trips SET qty_delivered = n, delivered_at = now() WHERE id = _id;
    END IF;
  ELSIF _action = 'incident' THEN
    IF old_status IN ('delivered') THEN RAISE EXCEPTION 'Transport déjà livré'; END IF;
    IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Description de l''incident obligatoire'; END IF;
    UPDATE public.logistics_trips SET incident_note = concat_ws(E'\n', incident_note, _reason) WHERE id = _id;
    new_status := 'incident';
  ELSIF _action = 'resume' THEN
    IF old_status <> 'incident' THEN RAISE EXCEPTION 'Aucun incident en cours'; END IF;
    new_status := COALESCE(NULLIF(d->>'status',''), 'in_transit');
    IF new_status NOT IN ('planned','loading','loaded','in_transit','arrived','unloading') THEN RAISE EXCEPTION 'Statut de reprise invalide'; END IF;
    IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  ELSIF _action = 'position' THEN
    IF (d->>'latitude') IS NULL OR (d->>'longitude') IS NULL THEN RAISE EXCEPTION 'Coordonnées obligatoires'; END IF;
    INSERT INTO public.logistics_gps_positions (tenant_id, country_id, trip_id, vehicle_id, latitude, longitude, speed_kmh, source, provider, raw, recorded_at)
    VALUES (tid, cid, _id, r.truck_id, (d->>'latitude')::numeric, (d->>'longitude')::numeric, NULLIF(d->>'speed_kmh','')::numeric,
      COALESCE(NULLIF(d->>'source',''),'manual'), d->>'provider', d->'raw', COALESCE(NULLIF(d->>'recorded_at','')::timestamptz, now()));
    UPDATE public.logistics_trips SET last_position = jsonb_build_object('latitude', d->>'latitude', 'longitude', d->>'longitude', 'recorded_at', COALESCE(d->>'recorded_at', now()::text)) WHERE id = _id;
    new_status := old_status;
  ELSE RAISE EXCEPTION 'Action inconnue %', _action; END IF;

  UPDATE public.logistics_trips SET status = new_status, updated_at = now() WHERE id = _id;
  INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
  VALUES (_id, tid, cid, _action, old_status, new_status, _reason, d, uid, (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.logistics_trip_action(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_trip_action(uuid, text, text, jsonb) TO authenticated;

CREATE VIEW public.logistics_alerts WITH (security_invoker = true) AS
SELECT 'document_expired'::text AS kind, CASE WHEN d.expires_on < current_date THEN 'critical' ELSE 'warning' END AS severity,
  d.tenant_id, d.country_id, d.id AS entity_id, NULL::uuid AS trip_id,
  d.doc_type || ' ' || COALESCE(d.doc_number,'') || ' — ' || COALESCE(v.registration, dr.full_name, '') AS label,
  (d.expires_on - current_date)::numeric AS value, d.expires_on::timestamptz AS due_at
FROM public.logistics_documents d
LEFT JOIN public.logistics_vehicles v ON v.id = d.vehicle_id
LEFT JOIN public.logistics_drivers dr ON dr.id = d.driver_id
WHERE d.expires_on IS NOT NULL AND d.expires_on <= current_date + 30
UNION ALL
SELECT 'delivery_late', CASE WHEN now() > t.eta + interval '6 hours' THEN 'critical' ELSE 'warning' END,
  t.tenant_id, t.country_id, t.id, t.id, t.reference,
  round(extract(epoch FROM now() - t.eta) / 3600, 1), t.eta
FROM public.logistics_trips t
WHERE t.eta IS NOT NULL AND t.eta < now() AND t.status NOT IN ('delivered','arrived','unloading')
UNION ALL
SELECT 'quantity_variance', CASE WHEN abs(t.qty_delivered - t.qty_loaded) > 2 * t.qty_loaded * t.tolerance_pct / 100 THEN 'critical' ELSE 'warning' END,
  t.tenant_id, t.country_id, t.id, t.id, t.reference,
  t.qty_delivered - t.qty_loaded, t.delivered_at
FROM public.logistics_trips t
WHERE t.qty_loaded > 0 AND t.qty_delivered IS NOT NULL AND abs(t.qty_delivered - t.qty_loaded) > t.qty_loaded * t.tolerance_pct / 100
UNION ALL
SELECT 'seal_broken', 'critical', s.tenant_id, s.country_id, s.id, s.trip_id, 'Scellé ' || s.serial, NULL, s.updated_at
FROM public.logistics_seals s WHERE s.status IN ('broken','anomaly');
GRANT SELECT ON public.logistics_alerts TO authenticated;

CREATE INDEX ON public.logistics_trips (tenant_id, country_id, status);
CREATE INDEX ON public.logistics_trips (supply_request_id);
CREATE INDEX ON public.logistics_trip_events (trip_id);
CREATE INDEX ON public.logistics_gps_positions (trip_id, recorded_at DESC);
CREATE INDEX ON public.logistics_documents (expires_on);