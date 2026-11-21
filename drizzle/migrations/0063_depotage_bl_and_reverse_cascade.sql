ALTER TABLE public.index_tank_readings ADD COLUMN IF NOT EXISTS depotage_reception numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.index_tank_readings.depotage IS 'Dépotages du jour au volume chargé (BL) des réceptions validées';
COMMENT ON COLUMN public.index_tank_readings.depotage_reception IS 'Volume constaté en cuve (jauge après − avant) pour les mêmes réceptions ; écart camion = depotage_reception − depotage';

CREATE OR REPLACE FUNCTION public.index_tank_reading_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _e record; _t record; _tz text; _prev numeric; _dep numeric; _rec numeric; _refs text;
BEGIN
  SELECT id, station_id, entry_date, tenant_id, country_id INTO _e FROM public.index_entries WHERE id = NEW.entry_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'Saisie d''index introuvable'; END IF;
  SELECT id, station_id, product_type INTO _t FROM public.tanks WHERE id = NEW.tank_id;
  IF _t.id IS NULL OR _t.station_id <> _e.station_id THEN
    RAISE EXCEPTION 'La cuve doit appartenir à la station de la saisie';
  END IF;
  IF NEW.jauge IS NULL OR NEW.jauge < 0 OR NEW.stock_ouverture < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour les jauges et stocks';
  END IF;
  NEW.station_id := _e.station_id;
  NEW.entry_date := _e.entry_date;
  NEW.tenant_id := _e.tenant_id;
  NEW.country_id := _e.country_id;
  NEW.product_type := _t.product_type;

  SELECT r.jauge INTO _prev FROM public.index_tank_readings r
   WHERE r.tank_id = NEW.tank_id AND r.entry_date < _e.entry_date
   ORDER BY r.entry_date DESC LIMIT 1;
  IF _prev IS NOT NULL THEN NEW.stock_ouverture := _prev; END IF;

  -- Dépotages = réceptions validées du jour, au volume chargé (BL) ; volume constaté gardé à part
  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO _tz FROM public.countries c WHERE c.id = _e.country_id;
  _tz := COALESCE(_tz, 'Africa/Porto-Novo');
  SELECT COALESCE(sum(COALESCE(s.qty_loaded, s.qty_received)), 0), COALESCE(sum(s.qty_received), 0),
         string_agg(s.reference || COALESCE(' / BL ' || s.bl_number, '') || COALESCE(' / ' || s.driver_name, ''), ' ; ')
    INTO _dep, _rec, _refs
  FROM public.supply_requests s
  WHERE s.tank_id = NEW.tank_id AND s.status = 'received' AND s.received_at IS NOT NULL
    AND (s.received_at AT TIME ZONE _tz)::date = _e.entry_date;
  NEW.depotage := _dep;
  NEW.depotage_reception := _rec;
  NEW.depotage_refs := _refs;

  SELECT COALESCE(sum(p.liters_net), 0) INTO NEW.sortie
  FROM public.pump_index_entries p WHERE p.entry_id = NEW.entry_id AND p.tank_id = NEW.tank_id;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Recalcule les bilans de cuve non validés d'une cuve à une date locale (après réception ou annulation)
CREATE OR REPLACE FUNCTION public.refresh_pending_tank_readings(_tank uuid, _at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _tz text; _day date; n integer;
BEGIN
  IF _tank IS NULL OR _at IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO _tz
    FROM public.tanks t JOIN public.stations st ON st.id = t.station_id
    LEFT JOIN public.countries c ON c.id = st.country_id WHERE t.id = _tank;
  _day := (_at AT TIME ZONE COALESCE(_tz, 'Africa/Porto-Novo'))::date;
  UPDATE public.index_tank_readings r SET updated_at = now()
   WHERE r.tank_id = _tank AND r.entry_date = _day
     AND EXISTS (SELECT 1 FROM public.index_entries e WHERE e.id = r.entry_id AND e.status <> 'valide');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
REVOKE EXECUTE ON FUNCTION public.refresh_pending_tank_readings(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supply_transition(_id uuid, _action text, _reason text DEFAULT NULL::text, _data jsonb DEFAULT '{}'::jsonb)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); r record; d jsonb := COALESCE(_data,'{}'::jsonb);
  validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid,'supplies.validate');
  writer boolean := public.can_write_module(uid,'supplies');
  new_status text; mv uuid; recv numeric; tk uuid; booked numeric; recv_at timestamptz;
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
    -- Règle de gestion : la cuve est créditée du volume chargé (BL) ; l'écart camion reste visible à part
    booked := COALESCE(NULLIF(r.qty_loaded, 0), recv);
    recv_at := COALESCE((d->>'received_at')::timestamptz, now());
    INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, tank_id, product_id,
      movement_type, quantity, reason, reference, movement_date)
    VALUES (r.tenant_id, r.country_id, 'station', r.station_id, tk, r.product_id, 'entry', booked,
      'Réception approvisionnement ' || r.reference || COALESCE(' BL ' || r.bl_number, '')
        || ' (volume BL ' || booked::text || ' L, constaté ' || recv::text || ' L)', COALESCE(r.bl_number, r.reference),
      recv_at)
    RETURNING id INTO mv;
    UPDATE public.supply_requests SET tank_id = tk, gauge_before = (d->>'gauge_before')::numeric, gauge_after = (d->>'gauge_after')::numeric,
      qty_received = recv, delivery_variance = recv - qty_delivered,
      received_at = recv_at, stock_movement_id = mv WHERE id = _id;
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

  IF new_status = 'received' THEN
    PERFORM public.refresh_pending_tank_readings(tk, recv_at);
  END IF;

  INSERT INTO public.supply_request_events (request_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
  VALUES (_id, r.tenant_id, r.country_id, _action, r.status, new_status, _reason, d, uid, (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN new_status;
END $function$;

CREATE OR REPLACE FUNCTION public.supply_reception_reverse(_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record; mv uuid; existing uuid; qty numeric; _tz text; _day date; refreshed integer;
BEGIN
  SELECT * INTO r FROM public.supply_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Approvisionnement introuvable'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT (public.is_platform_admin(uid) OR public.has_permission(uid,'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
  IF r.status <> 'received' THEN RAISE EXCEPTION 'Seule une réception validée peut être annulée'; END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Un motif est obligatoire'; END IF;

  -- Une saisie d'index déjà validée N+1 ce jour-là sur cette cuve bloque l'annulation
  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO _tz FROM public.countries c WHERE c.id = r.country_id;
  _day := (r.received_at AT TIME ZONE COALESCE(_tz, 'Africa/Porto-Novo'))::date;
  IF EXISTS (SELECT 1 FROM public.index_tank_readings itr JOIN public.index_entries e ON e.id = itr.entry_id
             WHERE itr.tank_id = r.tank_id AND itr.entry_date = _day AND e.status = 'valide') THEN
    RAISE EXCEPTION 'La saisie d''index du % est déjà validée N+1 : remettez-la en attente avant d''annuler cette réception', to_char(_day, 'DD/MM/YYYY');
  END IF;

  -- Quantité réellement portée au stock par cette réception (BL ou jauge selon la règle en vigueur à l'époque)
  SELECT m.quantity INTO qty FROM public.stock_movements m WHERE m.id = r.stock_movement_id;
  qty := COALESCE(qty, r.qty_received);

  SELECT m.id INTO existing FROM public.stock_movements m
   WHERE m.tank_id = r.tank_id AND m.movement_type = 'adjustment_out' AND m.status = 'validated'
     AND m.quantity = qty AND m.reference = COALESCE(r.bl_number, r.reference)
     AND m.created_at > (SELECT created_at FROM public.stock_movements WHERE id = r.stock_movement_id)
     AND NOT EXISTS (SELECT 1 FROM public.supply_request_events e WHERE e.action = 'reverse_reception' AND e.data->>'movement_id' = m.id::text)
   ORDER BY m.created_at LIMIT 1;
  IF existing IS NOT NULL THEN mv := existing;
  ELSE
    INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, tank_id, product_id, movement_type, quantity, reason, reference, movement_date)
    VALUES (r.tenant_id, r.country_id, 'station', r.station_id, r.tank_id, r.product_id, 'adjustment_out', qty,
      'Annulation réception ' || r.reference || ' : ' || _reason, COALESCE(r.bl_number, r.reference), r.received_at)
    RETURNING id INTO mv;
  END IF;
  PERFORM set_config('app.supply_bypass','on',true);
  UPDATE public.supply_requests SET status = 'cancelled', last_reason = _reason,
    observations = concat_ws(E'\n', observations, 'Réception annulée : ' || _reason) WHERE id = _id;
  PERFORM set_config('app.supply_bypass','off',true);

  -- Cascade : la saisie d'index en attente du jour perd ce dépotage
  refreshed := public.refresh_pending_tank_readings(r.tank_id, r.received_at);

  INSERT INTO public.supply_request_events (request_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
  VALUES (_id, r.tenant_id, r.country_id, 'reverse_reception', 'received', 'cancelled', _reason,
    jsonb_build_object('movement_id', mv, 'qty', qty, 'reused_adjustment', existing IS NOT NULL, 'index_readings_refreshed', refreshed), uid,
    (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN 'cancelled';
END $$;
REVOKE EXECUTE ON FUNCTION public.supply_reception_reverse(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_reception_reverse(uuid, text) TO authenticated;

-- Backfill : recalcul des bilans de cuve des saisies non validées selon la nouvelle règle
UPDATE public.index_tank_readings r SET updated_at = now()
 WHERE EXISTS (SELECT 1 FROM public.index_entries e WHERE e.id = r.entry_id AND e.status <> 'valide');