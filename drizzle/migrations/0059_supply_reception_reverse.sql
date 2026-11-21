CREATE OR REPLACE FUNCTION public.supply_reception_reverse(_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record; mv uuid; existing uuid;
BEGIN
  SELECT * INTO r FROM public.supply_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Approvisionnement introuvable'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT (public.is_platform_admin(uid) OR public.has_permission(uid,'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
  IF r.status <> 'received' THEN RAISE EXCEPTION 'Seule une réception validée peut être annulée'; END IF;
  IF COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Un motif est obligatoire'; END IF;
  -- Réutilise un ajustement manuel déjà saisi (même cuve, quantité, référence) non rattaché
  SELECT m.id INTO existing FROM public.stock_movements m
   WHERE m.tank_id = r.tank_id AND m.movement_type = 'adjustment_out' AND m.status = 'validated'
     AND m.quantity = r.qty_received AND m.reference = COALESCE(r.bl_number, r.reference)
     AND m.created_at > (SELECT created_at FROM public.stock_movements WHERE id = r.stock_movement_id)
     AND NOT EXISTS (SELECT 1 FROM public.supply_request_events e WHERE e.action = 'reverse_reception' AND e.data->>'movement_id' = m.id::text)
   ORDER BY m.created_at LIMIT 1;
  IF existing IS NOT NULL THEN mv := existing;
  ELSE
    INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, tank_id, product_id, movement_type, quantity, reason, reference, movement_date)
    VALUES (r.tenant_id, r.country_id, 'station', r.station_id, r.tank_id, r.product_id, 'adjustment_out', r.qty_received,
      'Annulation réception ' || r.reference || ' : ' || _reason, COALESCE(r.bl_number, r.reference), r.received_at)
    RETURNING id INTO mv;
  END IF;
  PERFORM set_config('app.supply_bypass','on',true);
  UPDATE public.supply_requests SET status = 'cancelled', last_reason = _reason,
    observations = concat_ws(E'\n', observations, 'Réception annulée : ' || _reason) WHERE id = _id;
  PERFORM set_config('app.supply_bypass','off',true);
  INSERT INTO public.supply_request_events (request_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
  VALUES (_id, r.tenant_id, r.country_id, 'reverse_reception', 'received', 'cancelled', _reason,
    jsonb_build_object('movement_id', mv, 'qty', r.qty_received, 'reused_adjustment', existing IS NOT NULL), uid,
    (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN 'cancelled';
END $$;
REVOKE EXECUTE ON FUNCTION public.supply_reception_reverse(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supply_reception_reverse(uuid, text) TO authenticated;