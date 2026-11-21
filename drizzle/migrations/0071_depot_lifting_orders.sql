-- Phase 2 : bons d'enlèvement (BE) + disponibilité camions/chauffeurs
ALTER TABLE public.logistics_trips DROP CONSTRAINT logistics_trips_status_check;
ALTER TABLE public.logistics_trips ADD CONSTRAINT logistics_trips_status_check CHECK (status = ANY (ARRAY['planned','loading','loaded','in_transit','arrived','unloading','delivered','incident','cancelled']));

CREATE TABLE public.depot_lifting_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  number text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.depot_purchase_orders(id),
  depot_id uuid REFERENCES public.depots(id),
  trip_id uuid NOT NULL UNIQUE REFERENCES public.logistics_trips(id),
  vehicle_id uuid NOT NULL REFERENCES public.logistics_vehicles(id),
  tanker_id uuid REFERENCES public.logistics_vehicles(id),
  driver_id uuid NOT NULL REFERENCES public.logistics_drivers(id),
  load_mode text NOT NULL DEFAULT 'mono' CHECK (load_mode IN ('mono','mixed')),
  planned_date date NOT NULL DEFAULT CURRENT_DATE,
  total_litres numeric NOT NULL DEFAULT 0 CHECK (total_litres >= 0),
  status text NOT NULL DEFAULT 'established' CHECK (status IN ('established','signed','cancelled')),
  observations text,
  signature_png text, signed_by uuid, signed_by_name text, signed_role text, signed_at timestamptz,
  cancel_reason text, cancelled_by uuid, cancelled_at timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, number)
);
CREATE TABLE public.depot_lifting_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifting_id uuid NOT NULL REFERENCES public.depot_lifting_orders(id),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  proforma_line_id uuid NOT NULL REFERENCES public.depot_proforma_lines(id),
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  qty_litres numeric NOT NULL CHECK (qty_litres > 0)
);
CREATE TABLE public.depot_lifting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lifting_id uuid NOT NULL REFERENCES public.depot_lifting_orders(id),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  action text NOT NULL, from_status text, to_status text, reason text, data jsonb,
  author_id uuid, author_name text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.depot_lifting_orders(order_id);
CREATE INDEX ON public.depot_lifting_lines(lifting_id);
CREATE INDEX ON public.depot_lifting_lines(proforma_line_id);
CREATE INDEX ON public.depot_lifting_events(lifting_id);

GRANT SELECT ON public.depot_lifting_orders, public.depot_lifting_lines, public.depot_lifting_events TO authenticated;
GRANT ALL ON public.depot_lifting_orders, public.depot_lifting_lines, public.depot_lifting_events TO service_role;
ALTER TABLE public.depot_lifting_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depot_lifting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depot_lifting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoped read" ON public.depot_lifting_orders FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "scoped read" ON public.depot_lifting_lines FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "scoped read" ON public.depot_lifting_events FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE TRIGGER depot_lifting_events_immutable BEFORE UPDATE OR DELETE ON public.depot_lifting_events FOR EACH ROW EXECUTE FUNCTION public.depot_po_events_immutable();
CREATE TRIGGER depot_lifting_lines_immutable BEFORE UPDATE OR DELETE ON public.depot_lifting_lines FOR EACH ROW EXECUTE FUNCTION public.depot_po_events_immutable();

-- Disponibilité (lecture via RLS de l'appelant)
CREATE OR REPLACE FUNCTION public.logistics_vehicle_availability(_tenant uuid, _country uuid)
RETURNS TABLE(vehicle_id uuid, registration text, kind text, capacity numeric, available boolean, reasons text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT v.id, v.registration, v.kind,
    COALESCE(NULLIF((SELECT sum(c.capacity_litres) FROM public.logistics_compartments c WHERE c.vehicle_id = v.id), 0), v.capacity_litres),
    cardinality(r.reasons) = 0, r.reasons
  FROM public.logistics_vehicles v
  CROSS JOIN LATERAL (SELECT array_remove(ARRAY[
    CASE WHEN v.status <> 'active' THEN 'Statut opérationnel : ' || v.status END,
    (SELECT 'Chargement non entièrement dépoté : ' || string_agg(COALESCE(b.number || ' / ', '') || COALESCE(t.reference, '?'), ', ')
       FROM public.logistics_trips t LEFT JOIN public.depot_lifting_orders b ON b.trip_id = t.id
      WHERE (t.truck_id = v.id OR t.tanker_id = v.id) AND t.status NOT IN ('delivered','cancelled')),
    (SELECT 'Document expiré : ' || string_agg(d.doc_type || ' (' || to_char(d.expires_on, 'DD/MM/YYYY') || ')', ', ')
       FROM public.logistics_documents d WHERE d.vehicle_id = v.id AND d.expires_on < CURRENT_DATE),
    (SELECT 'Document manquant : ' || string_agg(x, ', ') FROM unnest(ARRAY['Assurance','Carte grise','Visite technique']) x
      WHERE NOT EXISTS (SELECT 1 FROM public.logistics_documents d WHERE d.vehicle_id = v.id AND d.doc_type = x))
  ]::text[], NULL) AS reasons) r
  WHERE v.tenant_id = _tenant AND v.country_id = _country
$$;
CREATE OR REPLACE FUNCTION public.logistics_driver_availability(_tenant uuid, _country uuid)
RETURNS TABLE(driver_id uuid, full_name text, available boolean, reasons text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT x.id, x.full_name, cardinality(r.reasons) = 0, r.reasons
  FROM public.logistics_drivers x
  CROSS JOIN LATERAL (SELECT array_remove(ARRAY[
    CASE WHEN x.status <> 'active' THEN 'Statut : ' || x.status END,
    (SELECT 'Opération en cours : ' || string_agg(COALESCE(b.number || ' / ', '') || COALESCE(t.reference, '?'), ', ')
       FROM public.logistics_trips t LEFT JOIN public.depot_lifting_orders b ON b.trip_id = t.id
      WHERE t.driver_id = x.id AND t.status NOT IN ('delivered','cancelled')),
    (SELECT 'Document expiré : ' || string_agg(d.doc_type || ' (' || to_char(d.expires_on, 'DD/MM/YYYY') || ')', ', ')
       FROM public.logistics_documents d WHERE d.driver_id = x.id AND d.expires_on < CURRENT_DATE),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.logistics_documents d WHERE d.driver_id = x.id AND d.doc_type = 'Permis poids lourd') THEN 'Document manquant : Permis poids lourd' END
  ]::text[], NULL) AS reasons) r
  WHERE x.tenant_id = _tenant AND x.country_id = _country
$$;
REVOKE ALL ON FUNCTION public.logistics_vehicle_availability(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.logistics_driver_availability(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_vehicle_availability(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.logistics_driver_availability(uuid, uuid) TO authenticated, service_role;

-- Le plan d'un transport rattaché à un BE n'est écrit que par depot_supply_action
CREATE OR REPLACE FUNCTION public.logistics_set_loads(_trip uuid, _mode text, _lines jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); r record; veh uuid; cap numeric; tot numeric := 0; l jsonb; c record; nprod int; n int := 0;
BEGIN
  SELECT * INTO r FROM public.logistics_trips WHERE id = _trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.can_write_module(uid, 'supplies') THEN RAISE EXCEPTION 'Droit supplies requis'; END IF;
  IF EXISTS (SELECT 1 FROM public.depot_lifting_orders b WHERE b.trip_id = _trip) AND COALESCE(current_setting('lumatek.be_write', true), '') <> '1' THEN
    RAISE EXCEPTION 'Plan de chargement fixé par le bon d''enlèvement : annulez le BE et établissez-en un nouveau'; END IF;
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
END $function$;

-- Un transport rattaché à un BE ne démarre son chargement qu'une fois le BE signé ; un transport annulé est figé
CREATE OR REPLACE FUNCTION public.logistics_trip_load_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tot numeric; pending int; dlv numeric; be record;
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'Transport annulé : aucune reprise possible'; END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND COALESCE(current_setting('lumatek.be_write', true), '') <> '1' THEN
    RAISE EXCEPTION 'Annulation uniquement via le bon d''enlèvement'; END IF;
  IF NEW.status = 'loading' AND OLD.status = 'planned' THEN
    SELECT number, status INTO be FROM public.depot_lifting_orders WHERE trip_id = NEW.id;
    IF FOUND AND be.status <> 'signed' THEN RAISE EXCEPTION 'Bon d''enlèvement % non signé : chargement impossible', be.number; END IF;
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.depot_supply_action(_action text, _data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data, '{}'::jsonb); l jsonb;
  t uuid; c uuid; pid uuid; oid uuid; po record; be record; pf record; who text; n int; st text;
  q numeric; p numeric; r numeric; ht numeric; tx numeric;
  truck uuid; tank uuid; drv uuid; dep uuid; trip uuid; bid uuid; why text; prod record; pl record; need numeric; avail numeric; take numeric; mode text;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE user_id = uid;
  IF _action = 'create_proforma' THEN
    t := (d->>'tenant_id')::uuid; c := (d->>'country_id')::uuid;
  ELSIF _action IN ('sign_lifting','cancel_lifting') THEN
    SELECT * INTO be FROM public.depot_lifting_orders WHERE id = COALESCE((d->>'lifting_id')::uuid, '00000000-0000-0000-0000-000000000000') FOR UPDATE;
    IF be.id IS NULL THEN RAISE EXCEPTION 'Bon d''enlèvement introuvable'; END IF;
    SELECT * INTO po FROM public.depot_purchase_orders WHERE id = be.order_id FOR UPDATE;
    t := be.tenant_id; c := be.country_id;
  ELSE
    SELECT * INTO po FROM public.depot_purchase_orders WHERE id = COALESCE((d->>'order_id')::uuid, '00000000-0000-0000-0000-000000000000') FOR UPDATE;
    IF _action = 'issue_order' THEN
      SELECT tenant_id, country_id INTO t, c FROM public.depot_proformas WHERE id = (d->>'proforma_id')::uuid;
    ELSE
      IF po.id IS NULL THEN RAISE EXCEPTION 'Bon de commande introuvable'; END IF;
      t := po.tenant_id; c := po.country_id;
    END IF;
  END IF;
  IF t IS NULL OR c IS NULL THEN RAISE EXCEPTION 'Périmètre manquant'; END IF;
  IF NOT public.can_access_tenant_country(uid, t, c) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(t) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;

  IF _action = 'create_proforma' THEN
    IF NOT (public.has_permission(uid,'supplies.create') OR public.has_permission(uid,'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.create requis'; END IF;
    IF length(btrim(COALESCE(d->>'number',''))) = 0 THEN RAISE EXCEPTION 'Numéro de pro-forma obligatoire'; END IF;
    IF jsonb_typeof(d->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'lines') = 0 THEN RAISE EXCEPTION 'Au moins une ligne produit'; END IF;
    IF NULLIF(d->>'valid_until','')::date < (d->>'proforma_date')::date THEN RAISE EXCEPTION 'Date de validité antérieure à la date du pro-forma'; END IF;
    IF (d->>'supplier_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=(d->>'supplier_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Fournisseur hors périmètre'; END IF;
    IF (d->>'depot_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depots WHERE id=(d->>'depot_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Dépôt hors périmètre'; END IF;
    INSERT INTO public.depot_proformas (tenant_id, country_id, supplier_id, depot_id, number, proforma_date, valid_until, observations, created_by)
    VALUES (t, c, NULLIF(d->>'supplier_id','')::uuid, NULLIF(d->>'depot_id','')::uuid, btrim(d->>'number'), (d->>'proforma_date')::date,
            NULLIF(d->>'valid_until','')::date, NULLIF(btrim(COALESCE(d->>'observations','')),''), uid) RETURNING id INTO pid;
    FOR l IN SELECT * FROM jsonb_array_elements(d->'lines') LOOP
      q := (l->>'qty_litres')::numeric; p := (l->>'unit_price')::numeric; r := COALESCE(NULLIF(l->>'tax_rate','')::numeric, 0);
      IF q IS NULL OR q <= 0 OR p IS NULL OR p < 0 OR r < 0 OR r > 100 THEN RAISE EXCEPTION 'Ligne invalide (quantité > 0, prix ≥ 0, taxe 0–100 %%)'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.petroleum_products WHERE id=(l->>'product_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Produit hors périmètre'; END IF;
      ht := round(q*p, 2); tx := round(ht*r/100, 2);
      INSERT INTO public.depot_proforma_lines (proforma_id, tenant_id, country_id, product_id, qty_litres, unit_price, tax_rate, amount_ht, tax_amount, amount_ttc)
      VALUES (pid, t, c, (l->>'product_id')::uuid, q, p, r, ht, tx, ht+tx);
    END LOOP;
    UPDATE public.depot_proformas f SET total_ht=s.h, total_tax=s.x, total_ttc=s.h+s.x
      FROM (SELECT sum(amount_ht) h, sum(tax_amount) x FROM public.depot_proforma_lines WHERE proforma_id=pid) s WHERE f.id=pid;
    RETURN pid;

  ELSIF _action = 'issue_order' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    IF EXISTS (SELECT 1 FROM public.depot_purchase_orders WHERE proforma_id=(d->>'proforma_id')::uuid) THEN RAISE EXCEPTION 'Bon de commande déjà émis pour ce pro-forma'; END IF;
    IF (d->>'client_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id=(d->>'client_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Client hors périmètre'; END IF;
    IF length(btrim(COALESCE(d->>'beneficiary_name',''))) = 0 THEN RAISE EXCEPTION 'Bénéficiaire obligatoire'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('depot_po'||t||c));
    SELECT count(*)+1 INTO n FROM public.depot_purchase_orders WHERE tenant_id=t AND country_id=c AND date_part('year',issue_date)=date_part('year',CURRENT_DATE);
    INSERT INTO public.depot_purchase_orders (tenant_id, country_id, proforma_id, number, beneficiary_client_id, beneficiary_name, status_by, status_by_name, created_by)
    VALUES (t, c, (d->>'proforma_id')::uuid, 'BC-'||to_char(CURRENT_DATE,'YYYY')||'-'||lpad(n::text,4,'0'), NULLIF(d->>'client_id','')::uuid, btrim(d->>'beneficiary_name'), uid, who, uid)
    RETURNING id INTO oid;
    INSERT INTO public.depot_purchase_order_events (order_id, tenant_id, country_id, action, to_status, author_id, author_name)
    VALUES (oid, t, c, 'issue', 'non_paye', uid, who);
    RETURN oid;

  ELSIF _action = 'set_payment_status' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    st := d->>'status';
    IF st NOT IN ('non_paye','pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Statut inconnu'; END IF;
    IF st = po.payment_status THEN RAISE EXCEPTION 'Statut inchangé'; END IF;
    IF st = 'non_paye' AND (EXISTS (SELECT 1 FROM public.depot_proforma_lines WHERE proforma_id=po.proforma_id AND qty_lifted>0)
        OR EXISTS (SELECT 1 FROM public.depot_lifting_orders WHERE order_id=po.id AND status<>'cancelled')) THEN
      RAISE EXCEPTION 'Des bons d''enlèvement existent déjà : impossible de repasser en Non payé';
    END IF;
    UPDATE public.depot_purchase_orders SET payment_status=st, status_by=uid, status_by_name=who, status_at=now() WHERE id=po.id;
    INSERT INTO public.depot_purchase_order_events (order_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
    VALUES (po.id, t, c, 'payment_status', po.payment_status, st, NULLIF(btrim(COALESCE(d->>'reason','')),''), uid, who);
    RETURN po.id;

  ELSIF _action = 'create_lifting' THEN
    IF NOT (public.has_permission(uid,'supplies.create') OR public.has_permission(uid,'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.create requis'; END IF;
    IF po.payment_status NOT IN ('pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Bon de commande % NON PAYÉ : stock bloqué, aucun enlèvement possible', po.number; END IF;
    SELECT * INTO pf FROM public.depot_proformas WHERE id = po.proforma_id;
    truck := NULLIF(d->>'vehicle_id','')::uuid; tank := NULLIF(d->>'tanker_id','')::uuid; drv := NULLIF(d->>'driver_id','')::uuid;
    dep := COALESCE(NULLIF(d->>'depot_id','')::uuid, pf.depot_id); mode := COALESCE(NULLIF(d->>'load_mode',''), 'mono');
    IF truck IS NULL OR drv IS NULL THEN RAISE EXCEPTION 'Camion et chauffeur obligatoires'; END IF;
    IF tank = truck THEN tank := NULL; END IF;
    IF dep IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depots WHERE id=dep AND tenant_id=t) THEN RAISE EXCEPTION 'Dépôt hors périmètre'; END IF;
    PERFORM 1 FROM public.logistics_vehicles WHERE id IN (truck, tank) FOR UPDATE;
    PERFORM 1 FROM public.logistics_drivers WHERE id = drv FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.logistics_vehicles WHERE id=truck AND tenant_id=t AND country_id=c)
       OR (tank IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.logistics_vehicles WHERE id=tank AND tenant_id=t AND country_id=c))
       OR NOT EXISTS (SELECT 1 FROM public.logistics_drivers WHERE id=drv AND tenant_id=t AND country_id=c) THEN
      RAISE EXCEPTION 'Camion ou chauffeur hors périmètre'; END IF;
    SELECT string_agg(a.registration || ' : ' || array_to_string(a.reasons, ' ; '), ' | ') INTO why
      FROM public.logistics_vehicle_availability(t, c) a WHERE a.vehicle_id IN (truck, tank) AND NOT a.available;
    IF why IS NOT NULL THEN RAISE EXCEPTION 'Camion indisponible — %', why; END IF;
    SELECT string_agg(a.full_name || ' : ' || array_to_string(a.reasons, ' ; '), ' | ') INTO why
      FROM public.logistics_driver_availability(t, c) a WHERE a.driver_id = drv AND NOT a.available;
    IF why IS NOT NULL THEN RAISE EXCEPTION 'Chauffeur indisponible — %', why; END IF;
    IF jsonb_typeof(d->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'lines') = 0 THEN RAISE EXCEPTION 'Plan de chargement vide'; END IF;

    -- Quantités par produit ≤ solde disponible du BC (autorisé − enlevé − réservé par BE établis)
    FOR prod IN SELECT (x->>'product_id')::uuid AS product_id, sum((x->>'qty_litres')::numeric) AS qty FROM jsonb_array_elements(d->'lines') x GROUP BY 1 LOOP
      SELECT COALESCE(sum(pl2.qty_litres - pl2.qty_lifted - COALESCE((SELECT sum(ll.qty_litres) FROM public.depot_lifting_lines ll JOIN public.depot_lifting_orders b ON b.id = ll.lifting_id
               WHERE ll.proforma_line_id = pl2.id AND b.status = 'established'), 0)), 0)
        INTO avail FROM public.depot_proforma_lines pl2 WHERE pl2.proforma_id = po.proforma_id AND pl2.product_id = prod.product_id;
      IF NOT EXISTS (SELECT 1 FROM public.depot_proforma_lines WHERE proforma_id = po.proforma_id AND product_id = prod.product_id) THEN
        RAISE EXCEPTION 'Produit absent du bon de commande %', po.number; END IF;
      IF prod.qty > avail THEN RAISE EXCEPTION 'Quantité supérieure au solde disponible du BC % : % L demandés, % L disponibles', po.number, prod.qty, avail; END IF;
    END LOOP;

    INSERT INTO public.logistics_trips (tenant_id, country_id, carrier_id, truck_id, tanker_id, driver_id, planned_departure, created_by)
    VALUES (t, c, (SELECT carrier_id FROM public.logistics_vehicles WHERE id = truck), truck, tank, drv, NULLIF(d->>'planned_date','')::date::timestamptz, uid)
    RETURNING id INTO trip;
    UPDATE public.logistics_trips SET reference = 'TRP-' || to_char(now(),'YYYYMMDD') || '-' || upper(left(trip::text,6)) WHERE id = trip;
    INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, data, author_id, author_name)
    VALUES (trip, t, c, 'create', NULL, 'planned', jsonb_build_object('source', 'bon_enlevement'), uid, who);

    PERFORM pg_advisory_xact_lock(hashtext('depot_be'||t||c));
    SELECT count(*)+1 INTO n FROM public.depot_lifting_orders WHERE tenant_id=t AND country_id=c AND date_part('year',created_at)=date_part('year',now());
    INSERT INTO public.depot_lifting_orders (tenant_id, country_id, number, order_id, depot_id, trip_id, vehicle_id, tanker_id, driver_id, load_mode, planned_date, observations, created_by)
    VALUES (t, c, 'BE-'||to_char(now(),'YYYY')||'-'||lpad(n::text,6,'0'), po.id, dep, trip, truck, tank, drv, mode,
            COALESCE(NULLIF(d->>'planned_date','')::date, CURRENT_DATE), NULLIF(btrim(COALESCE(d->>'observations','')),''), uid)
    RETURNING id INTO bid;

    PERFORM set_config('lumatek.be_write', '1', true);
    PERFORM public.logistics_set_loads(trip, mode, d->'lines');
    PERFORM set_config('lumatek.be_write', '', true);

    -- Réservation ventilée sur les lignes du pro-forma
    FOR prod IN SELECT product_id, sum(qty_litres) AS qty FROM public.logistics_trip_loads WHERE trip_id = trip GROUP BY 1 LOOP
      need := prod.qty;
      FOR pl IN SELECT pl2.id, pl2.qty_litres - pl2.qty_lifted - COALESCE((SELECT sum(ll.qty_litres) FROM public.depot_lifting_lines ll JOIN public.depot_lifting_orders b ON b.id = ll.lifting_id
                 WHERE ll.proforma_line_id = pl2.id AND b.status = 'established'), 0) AS free
                FROM public.depot_proforma_lines pl2 WHERE pl2.proforma_id = po.proforma_id AND pl2.product_id = prod.product_id ORDER BY pl2.id LOOP
        EXIT WHEN need <= 0;
        take := LEAST(need, GREATEST(pl.free, 0));
        IF take > 0 THEN
          INSERT INTO public.depot_lifting_lines (lifting_id, tenant_id, country_id, proforma_line_id, product_id, qty_litres) VALUES (bid, t, c, pl.id, prod.product_id, take);
          need := need - take;
        END IF;
      END LOOP;
      IF need > 0 THEN RAISE EXCEPTION 'Solde du BC insuffisant'; END IF;
    END LOOP;
    UPDATE public.depot_lifting_orders SET total_litres = (SELECT sum(qty_litres) FROM public.depot_lifting_lines WHERE lifting_id = bid) WHERE id = bid;
    INSERT INTO public.depot_lifting_events (lifting_id, tenant_id, country_id, action, to_status, data, author_id, author_name)
    VALUES (bid, t, c, 'create', 'established', jsonb_build_object('order', po.number, 'lines', d->'lines'), uid, who);
    RETURN bid;

  ELSIF _action = 'sign_lifting' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis (responsable logistique)'; END IF;
    IF be.status <> 'established' THEN RAISE EXCEPTION 'BE % déjà %', be.number, CASE be.status WHEN 'signed' THEN 'signé' ELSE 'annulé' END; END IF;
    IF COALESCE(d->>'signature_png','') NOT LIKE 'data:image/png;base64,%' OR length(d->>'signature_png') > 400000 THEN RAISE EXCEPTION 'Signature manuscrite obligatoire'; END IF;
    IF po.payment_status NOT IN ('pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Bon de commande non payé'; END IF;
    IF EXISTS (SELECT 1 FROM public.depot_lifting_lines ll JOIN public.depot_proforma_lines pl2 ON pl2.id = ll.proforma_line_id
               WHERE ll.lifting_id = be.id AND pl2.qty_lifted + ll.qty_litres > pl2.qty_litres) THEN RAISE EXCEPTION 'Solde du BC dépassé'; END IF;
    UPDATE public.depot_proforma_lines pl2 SET qty_lifted = pl2.qty_lifted + s.q
      FROM (SELECT proforma_line_id, sum(qty_litres) q FROM public.depot_lifting_lines WHERE lifting_id = be.id GROUP BY 1) s WHERE pl2.id = s.proforma_line_id;
    UPDATE public.depot_lifting_orders SET status = 'signed', signature_png = d->>'signature_png', signed_by = uid, signed_by_name = who,
      signed_role = 'Responsable logistique', signed_at = now() WHERE id = be.id;
    INSERT INTO public.depot_lifting_events (lifting_id, tenant_id, country_id, action, from_status, to_status, author_id, author_name)
    VALUES (be.id, t, c, 'sign', 'established', 'signed', uid, who);
    RETURN be.id;

  ELSIF _action = 'cancel_lifting' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    IF be.status = 'cancelled' THEN RAISE EXCEPTION 'BE déjà annulé'; END IF;
    IF length(btrim(COALESCE(d->>'reason',''))) < 5 THEN RAISE EXCEPTION 'Motif d''annulation obligatoire (5 caractères minimum)'; END IF;
    IF EXISTS (SELECT 1 FROM public.logistics_trips WHERE id = be.trip_id AND status <> 'planned') THEN
      RAISE EXCEPTION 'Chargement déjà commencé : annulation impossible, passez par la rectification des écarts'; END IF;
    IF be.status = 'signed' THEN
      UPDATE public.depot_proforma_lines pl2 SET qty_lifted = pl2.qty_lifted - s.q
        FROM (SELECT proforma_line_id, sum(qty_litres) q FROM public.depot_lifting_lines WHERE lifting_id = be.id GROUP BY 1) s WHERE pl2.id = s.proforma_line_id;
    END IF;
    UPDATE public.depot_lifting_orders SET status = 'cancelled', cancel_reason = btrim(d->>'reason'), cancelled_by = uid, cancelled_at = now() WHERE id = be.id;
    PERFORM set_config('lumatek.be_write', '1', true);
    UPDATE public.logistics_trips SET status = 'cancelled', incident_note = 'BE ' || be.number || ' annulé : ' || btrim(d->>'reason') WHERE id = be.trip_id;
    PERFORM set_config('lumatek.be_write', '', true);
    INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
    VALUES (be.trip_id, t, c, 'cancel', 'planned', 'cancelled', btrim(d->>'reason'), uid, who);
    INSERT INTO public.depot_lifting_events (lifting_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
    VALUES (be.id, t, c, 'cancel', be.status, 'cancelled', btrim(d->>'reason'), uid, who);
    RETURN be.id;
  END IF;
  RAISE EXCEPTION 'Action inconnue %', _action;
END $$;
REVOKE ALL ON FUNCTION public.depot_supply_action(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.depot_supply_action(text, jsonb) TO authenticated;