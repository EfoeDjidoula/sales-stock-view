CREATE OR REPLACE FUNCTION public.validate_depotage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t_station uuid;
BEGIN
  IF NEW.truck_nominal_capacity < 0 OR NEW.tank_capacity_liters < 0
     OR NEW.quantity_to_unload < 0 OR NEW.quantity_unloaded < 0
     OR NEW.tolerance_rate < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour le dépotage';
  END IF;

  IF NEW.tolerance_rate IS NULL OR NEW.tolerance_rate = 0 THEN
    RAISE EXCEPTION 'Le taux de tolérance est obligatoire et doit être supérieur à 0';
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

  RETURN NEW;
END;
$function$;