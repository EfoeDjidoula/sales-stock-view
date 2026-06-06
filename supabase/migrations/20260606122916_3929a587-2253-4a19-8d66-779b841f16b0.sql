CREATE OR REPLACE FUNCTION public.validate_depotage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t_station uuid;
  _truck_capacity numeric;
  _compartments jsonb;
  _comp_total numeric;
BEGIN
  IF NEW.truck_nominal_capacity < 0 OR NEW.tank_capacity_liters < 0
     OR NEW.quantity_to_unload < 0 OR NEW.quantity_unloaded < 0
     OR NEW.tolerance_rate < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour le dépotage';
  END IF;

  IF NEW.tolerance_rate IS NULL OR NEW.tolerance_rate = 0 THEN
    RAISE EXCEPTION 'Le taux de tolérance est obligatoire et doit être supérieur à 0';
  END IF;

  IF NEW.tolerance_rate > 100 THEN
    RAISE EXCEPTION 'Le taux de tolérance ne peut pas dépasser 100%%';
  END IF;

  IF NEW.tank_capacity_liters > 0 AND NEW.quantity_to_unload > NEW.tank_capacity_liters THEN
    RAISE EXCEPTION 'La quantité à dépoter (% L) dépasse la capacité de la cuve (% L)', NEW.quantity_to_unload, NEW.tank_capacity_liters;
  END IF;

  IF NEW.tank_capacity_liters > 0 AND NEW.quantity_unloaded > NEW.tank_capacity_liters THEN
    RAISE EXCEPTION 'La quantité dépotée (% L) dépasse la capacité de la cuve (% L)', NEW.quantity_unloaded, NEW.tank_capacity_liters;
  END IF;

  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id INTO _t_station FROM public.tanks WHERE id = NEW.tank_id;
    IF _t_station IS NULL THEN
      RAISE EXCEPTION 'Cuve introuvable';
    END IF;
    IF _t_station <> NEW.station_id THEN
      RAISE EXCEPTION 'La cuve doit appartenir à la station du dépotage';
    END IF;
  END IF;

  -- Contrôle de la capacité du camion (compartiments ou capacité nominale)
  IF NEW.truck_id IS NOT NULL THEN
    SELECT nominal_capacity, compartments INTO _truck_capacity, _compartments
    FROM public.trucks WHERE id = NEW.truck_id;
    IF _truck_capacity IS NULL THEN
      RAISE EXCEPTION 'Camion introuvable';
    END IF;

    SELECT COALESCE(SUM((value)::numeric), 0) INTO _comp_total
    FROM jsonb_array_elements_text(COALESCE(_compartments, '[]'::jsonb)) AS value;

    IF _comp_total > 0 THEN
      _truck_capacity := _comp_total;
    END IF;

    IF _truck_capacity > 0 THEN
      IF NEW.quantity_to_unload > _truck_capacity THEN
        RAISE EXCEPTION 'La quantité à dépoter (% L) dépasse la capacité des compartiments du camion (% L)', NEW.quantity_to_unload, _truck_capacity;
      END IF;
      IF NEW.quantity_unloaded > _truck_capacity THEN
        RAISE EXCEPTION 'La quantité dépotée (% L) dépasse la capacité des compartiments du camion (% L)', NEW.quantity_unloaded, _truck_capacity;
      END IF;
      IF NEW.quantity_to_unload + (NEW.quantity_to_unload * NEW.tolerance_rate / 100) > _truck_capacity THEN
        RAISE EXCEPTION 'La quantité à dépoter plus la tolérance dépasse la capacité du camion (% L)', _truck_capacity;
      END IF;
    END IF;
  END IF;

  -- Validation des horodatages
  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'L''heure de début est obligatoire si une heure de fin est renseignée';
  END IF;

  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'L''heure de fin doit être strictement postérieure à l''heure de début';
  END IF;

  RETURN NEW;
END;
$function$;