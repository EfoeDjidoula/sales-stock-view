CREATE OR REPLACE FUNCTION public.index_tank_reading_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _e record; _t record; _tz text; _prev numeric; _dep numeric; _rec numeric; _refs text;
  _dep2 numeric; _rec2 numeric; _refs2 text;
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

  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO _tz FROM public.countries c WHERE c.id = _e.country_id;
  _tz := COALESCE(_tz, 'Africa/Porto-Novo');
  SELECT COALESCE(sum(COALESCE(s.qty_loaded, s.qty_received)), 0), COALESCE(sum(s.qty_received), 0),
         string_agg(s.reference || COALESCE(' / BL ' || s.bl_number, '') || COALESCE(' / ' || s.driver_name, ''), ' ; ')
    INTO _dep, _rec, _refs
  FROM public.supply_requests s
  WHERE s.tank_id = NEW.tank_id AND s.status = 'received' AND s.received_at IS NOT NULL
    AND (s.received_at AT TIME ZONE _tz)::date = _e.entry_date;

  -- Dépotages par compartiment (logistique) sans demande d'appro (sinon déjà comptés ci-dessus)
  SELECT COALESCE(sum(d.qty_bl), 0), COALESCE(sum(d.gauge_after - d.gauge_before), 0),
         string_agg(COALESCE(tr.reference, 'Dépotage'), ' ; ')
    INTO _dep2, _rec2, _refs2
  FROM public.logistics_discharges d
  LEFT JOIN public.logistics_trips tr ON tr.id = d.trip_id
  WHERE d.tank_id = NEW.tank_id AND d.stock_booked
    AND COALESCE(d.discharge_date, (d.created_at AT TIME ZONE _tz)::date) = _e.entry_date;

  NEW.depotage := _dep + _dep2;
  NEW.depotage_reception := _rec + _rec2;
  NEW.depotage_refs := NULLIF(concat_ws(' ; ', _refs, _refs2), '');

  SELECT COALESCE(sum(p.liters_net), 0) INTO NEW.sortie
  FROM public.pump_index_entries p WHERE p.entry_id = NEW.entry_id AND p.tank_id = NEW.tank_id;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.logistics_discharge_refresh_readings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.index_tank_readings r SET updated_at = now()
   WHERE r.tank_id = NEW.tank_id
     AND r.entry_date = COALESCE(NEW.discharge_date, NEW.created_at::date)
     AND EXISTS (SELECT 1 FROM public.index_entries e WHERE e.id = r.entry_id AND e.status <> 'valide');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.logistics_discharge_refresh_readings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_discharge_refresh_readings ON public.logistics_discharges;
CREATE TRIGGER trg_discharge_refresh_readings AFTER INSERT ON public.logistics_discharges
  FOR EACH ROW EXECUTE FUNCTION public.logistics_discharge_refresh_readings();

UPDATE public.index_tank_readings r SET updated_at = now()
 WHERE EXISTS (SELECT 1 FROM public.index_entries e WHERE e.id = r.entry_id AND e.status <> 'valide');