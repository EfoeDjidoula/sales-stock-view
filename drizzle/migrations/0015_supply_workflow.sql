INSERT INTO public.permissions (code, module, action, label)
SELECT 'supplies.'||a, 'supplies', a, l FROM (VALUES
 ('view','Voir les approvisionnements'),('create','Créer / saisir les approvisionnements'),('edit','Modifier les approvisionnements'),
 ('validate','Valider demandes et réceptions'),('export','Exporter les approvisionnements')) v(a,l)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = 'supplies.'||v.a);

CREATE TABLE public.supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','ordered','loaded','in_transit','delivered','received','cancelled')),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  tank_id uuid REFERENCES public.tanks(id),
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  depot_id uuid REFERENCES public.depots(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  need_reason text,
  needed_date date,
  qty_requested numeric NOT NULL CHECK (qty_requested > 0),
  qty_approved numeric CHECK (qty_approved >= 0),
  order_number text,
  qty_loaded numeric CHECK (qty_loaded >= 0),
  loaded_at timestamptz,
  bl_number text,
  truck_id uuid REFERENCES public.trucks(id),
  vehicle_registration text,
  driver_name text,
  seals text,
  departed_at timestamptz,
  qty_delivered numeric CHECK (qty_delivered >= 0),
  delivered_at timestamptz,
  seals_intact boolean,
  gauge_before numeric CHECK (gauge_before >= 0),
  gauge_after numeric CHECK (gauge_after >= 0),
  qty_received numeric CHECK (qty_received >= 0),
  delivery_variance numeric,
  transport_variance numeric,
  received_at timestamptz,
  stock_movement_id uuid,
  observations text,
  last_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.supply_requests(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  action text NOT NULL, from_status text, to_status text, reason text, data jsonb,
  author_id uuid, author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.supply_requests TO authenticated;
GRANT SELECT ON public.supply_request_events TO authenticated;
GRANT ALL ON public.supply_requests, public.supply_request_events TO service_role;

CREATE OR REPLACE FUNCTION public.supply_request_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Un approvisionnement ne peut pas être supprimé (utilisez Annuler)'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id, country_id INTO st FROM public.stations WHERE id = NEW.station_id;
    NEW.tenant_id := st.tenant_id; NEW.country_id := st.country_id;
    NEW.status := 'draft'; NEW.created_by := auth.uid();
    NEW.reference := 'APP-' || to_char(now(),'YYYYMMDD') || '-' || upper(left(NEW.id::text,6));
    NEW.qty_approved := NULL; NEW.qty_loaded := NULL; NEW.qty_delivered := NULL; NEW.qty_received := NULL;
    NEW.gauge_before := NULL; NEW.gauge_after := NULL; NEW.stock_movement_id := NULL;
    IF NEW.tank_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tanks WHERE id = NEW.tank_id AND station_id = NEW.station_id) THEN
      RAISE EXCEPTION 'La cuve n''appartient pas à la station';
    END IF;
    RETURN NEW;
  END IF;
  IF current_setting('app.supply_bypass', true) = 'on' THEN NEW.updated_at := now(); RETURN NEW; END IF;
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Approvisionnement verrouillé (statut %) : utilisez les étapes du workflow', OLD.status; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.tenant_id <> OLD.tenant_id OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.qty_received IS DISTINCT FROM OLD.qty_received OR NEW.stock_movement_id IS DISTINCT FROM OLD.stock_movement_id THEN
    RAISE EXCEPTION 'Modification interdite hors workflow';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.supply_request_before() FROM PUBLIC, anon;
CREATE TRIGGER supply_request_before BEFORE INSERT OR UPDATE OR DELETE ON public.supply_requests
FOR EACH ROW EXECUTE FUNCTION public.supply_request_before();

CREATE OR REPLACE FUNCTION public.supply_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historique immuable'; END $$;
CREATE TRIGGER supply_events_immutable BEFORE UPDATE OR DELETE ON public.supply_request_events
FOR EACH ROW EXECUTE FUNCTION public.supply_events_immutable();

CREATE OR REPLACE FUNCTION public.supply_transition(_id uuid, _action text, _reason text DEFAULT NULL, _data jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); r record; d jsonb := COALESCE(_data,'{}'::jsonb);
  validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid,'supplies.validate');
  writer boolean := public.can_write_module(uid,'supplies');
  new_status text; mv uuid; recv numeric; tk uuid;
  n_num numeric;
BEGIN
  SELECT * INTO r FROM public.supply_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Approvisionnement introuvable'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.is_module_enabled(r.tenant_id, r.country_id, 'livraisons') THEN RAISE EXCEPTION 'Module Livraisons désactivé'; END IF;
  IF NOT writer THEN RAISE EXCEPTION 'Droit supplies.create requis'; END IF;

  PERFORM set_config('app.supply_bypass','on',true);
  IF _action = 'submit' THEN
    IF r.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Seul un brouillon ou une demande rejetée peut être soumis'; END IF;
    new_status := 'submitted';
  ELSIF _action IN ('approve','reject') THEN
    IF NOT validator THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    IF r.status <> 'submitted' THEN RAISE EXCEPTION 'La demande doit être soumise'; END IF;
    IF _action = 'reject' AND COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Un motif est obligatoire'; END IF;
    IF _action = 'approve' THEN
      n_num := COALESCE((d->>'qty_approved')::numeric, r.qty_requested);
      IF n_num <= 0 THEN RAISE EXCEPTION 'Quantité validée invalide'; END IF;
      UPDATE public.supply_requests SET qty_approved = n_num WHERE id = _id;
      new_status := 'approved';
    ELSE new_status := 'rejected'; END IF;
  ELSIF _action = 'order' THEN
    IF r.status <> 'approved' THEN RAISE EXCEPTION 'La demande doit être validée'; END IF;
    UPDATE public.supply_requests SET order_number = COALESCE(d->>'order_number', order_number),
      depot_id = COALESCE((d->>'depot_id')::uuid, depot_id), supplier_id = COALESCE((d->>'supplier_id')::uuid, supplier_id) WHERE id = _id;
    new_status := 'ordered';
  ELSIF _action = 'load' THEN
    IF r.status <> 'ordered' THEN RAISE EXCEPTION 'La commande doit être passée'; END IF;
    n_num := (d->>'qty_loaded')::numeric;
    IF n_num IS NULL OR n_num <= 0 THEN RAISE EXCEPTION 'Quantité chargée obligatoire'; END IF;
    IF COALESCE(btrim(d->>'bl_number'),'') = '' THEN RAISE EXCEPTION 'Numéro de BL obligatoire'; END IF;
    UPDATE public.supply_requests SET qty_loaded = n_num, bl_number = d->>'bl_number',
      loaded_at = COALESCE((d->>'loaded_at')::timestamptz, now()),
      depot_id = COALESCE((d->>'depot_id')::uuid, depot_id),
      truck_id = COALESCE((d->>'truck_id')::uuid, truck_id),
      vehicle_registration = COALESCE(d->>'vehicle_registration', vehicle_registration),
      driver_name = COALESCE(d->>'driver_name', driver_name), seals = COALESCE(d->>'seals', seals) WHERE id = _id;
    new_status := 'loaded';
  ELSIF _action = 'depart' THEN
    IF r.status <> 'loaded' THEN RAISE EXCEPTION 'Le chargement doit être enregistré'; END IF;
    UPDATE public.supply_requests SET departed_at = COALESCE((d->>'departed_at')::timestamptz, now()) WHERE id = _id;
    new_status := 'in_transit';
  ELSIF _action = 'deliver' THEN
    IF r.status <> 'in_transit' THEN RAISE EXCEPTION 'Le camion doit être en transport'; END IF;
    n_num := (d->>'qty_delivered')::numeric;
    IF n_num IS NULL OR n_num <= 0 THEN RAISE EXCEPTION 'Quantité livrée obligatoire'; END IF;
    UPDATE public.supply_requests SET qty_delivered = n_num, transport_variance = n_num - qty_loaded,
      delivered_at = COALESCE((d->>'delivered_at')::timestamptz, now()),
      seals_intact = (d->>'seals_intact')::boolean WHERE id = _id;
    new_status := 'delivered';
  ELSIF _action = 'receive' THEN
    IF NOT validator THEN RAISE EXCEPTION 'Droit supplies.validate requis pour valider une réception'; END IF;
    IF r.status <> 'delivered' THEN RAISE EXCEPTION 'La livraison doit être enregistrée'; END IF;
    tk := COALESCE((d->>'tank_id')::uuid, r.tank_id);
    IF tk IS NULL OR NOT EXISTS (SELECT 1 FROM public.tanks WHERE id = tk AND station_id = r.station_id) THEN RAISE EXCEPTION 'Cuve de réception invalide'; END IF;
    IF (d->>'gauge_before') IS NULL OR (d->>'gauge_after') IS NULL THEN RAISE EXCEPTION 'Jauges avant et après obligatoires'; END IF;
    recv := (d->>'gauge_after')::numeric - (d->>'gauge_before')::numeric;
    IF recv <= 0 THEN RAISE EXCEPTION 'La jauge après doit être supérieure à la jauge avant'; END IF;
    INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, tank_id, product_id,
      movement_type, quantity, reason, reference, movement_date)
    VALUES (r.tenant_id, r.country_id, 'station', r.station_id, tk, r.product_id, 'entry', recv,
      'Réception approvisionnement ' || r.reference || COALESCE(' BL ' || r.bl_number, ''), COALESCE(r.bl_number, r.reference),
      COALESCE((d->>'received_at')::timestamptz, now()))
    RETURNING id INTO mv;
    UPDATE public.supply_requests SET tank_id = tk, gauge_before = (d->>'gauge_before')::numeric, gauge_after = (d->>'gauge_after')::numeric,
      qty_received = recv, delivery_variance = recv - qty_delivered,
      received_at = COALESCE((d->>'received_at')::timestamptz, now()), stock_movement_id = mv WHERE id = _id;
    new_status := 'received';
  ELSIF _action = 'cancel' THEN
    IF r.status IN ('received','cancelled') THEN RAISE EXCEPTION 'Impossible d''annuler (statut %)', r.status; END IF;
    IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Un motif est obligatoire'; END IF;
    IF r.status NOT IN ('draft','submitted','rejected') AND NOT validator THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    new_status := 'cancelled';
  ELSE RAISE EXCEPTION 'Action inconnue %', _action; END IF;

  IF d ? 'observations' THEN
    UPDATE public.supply_requests SET observations = concat_ws(E'\n', observations, NULLIF(d->>'observations','')) WHERE id = _id;
  END IF;
  UPDATE public.supply_requests SET status = new_status, last_reason = COALESCE(_reason, last_reason) WHERE id = _id;
  PERFORM set_config('app.supply_bypass','off',true);

  INSERT INTO public.supply_request_events (request_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
  VALUES (_id, r.tenant_id, r.country_id, _action, r.status, new_status, _reason, d, uid, (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN new_status;
END $$;
REVOKE EXECUTE ON FUNCTION public.supply_transition(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_transition(uuid, text, text, jsonb) TO authenticated;

ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_request_events ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supply_requests','supply_request_events'] LOOP
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''livraisons'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''livraisons''))', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''supplies'')', t);
  END LOOP;
END $$;
CREATE POLICY "Writers insert" ON public.supply_requests FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), 'supplies'));
CREATE POLICY "Writers update" ON public.supply_requests FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), 'supplies'));
CREATE POLICY "License write insert" ON public.supply_requests AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id));
CREATE POLICY "License write update" ON public.supply_requests AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id));
CREATE INDEX ON public.supply_requests (tenant_id, country_id, status);
CREATE INDEX ON public.supply_request_events (request_id);