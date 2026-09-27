CREATE OR REPLACE FUNCTION public.stock_movement_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid, 'stock.validate');
  loc uuid;
  avail numeric;
  tk record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('validated','rejected') THEN
      RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
    END IF;
    IF NOT is_validator THEN
      RAISE EXCEPTION 'Validation réservée aux utilisateurs autorisés (stock.validate)';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','validated_by','validated_at','validation_note'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','validated_by','validated_at','validation_note']) THEN
      RAISE EXCEPTION 'Seul le statut de validation peut être modifié';
    END IF;
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.status = 'validated' AND NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN
      loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
      avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);
      IF NEW.quantity > avail THEN
        RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  SELECT NULL::uuid AS station_id, NULL::uuid AS product_id, NULL::numeric AS capacity_liters INTO tk;
  NEW.requested_by := uid;
  NEW.requested_by_name := (SELECT full_name FROM public.profiles WHERE user_id = uid);
  NEW.created_at := now();
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour un ajustement ou un inventaire';
  END IF;
  IF NEW.movement_type = 'inventory' AND NEW.physical_level IS NULL THEN
    RAISE EXCEPTION 'Le niveau physique mesuré est obligatoire pour un inventaire';
  END IF;
  IF NEW.movement_type <> 'inventory' AND NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être strictement positive';
  END IF;

  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id, product_id, capacity_liters INTO tk FROM public.tanks WHERE id = NEW.tank_id;
    IF NEW.location_type <> 'station' OR tk.station_id IS DISTINCT FROM NEW.station_id THEN
      RAISE EXCEPTION 'La cuve n''appartient pas à cette station';
    END IF;
    IF tk.product_id IS NOT NULL AND tk.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au produit de la cuve';
    END IF;
  END IF;

  loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
  avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);

  IF NEW.movement_type = 'inventory' THEN
    NEW.theoretical_at_count := avail;
    NEW.quantity := 0;
  END IF;

  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') THEN
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSIF NEW.movement_type = 'initial' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE movement_type = 'initial' AND status <> 'rejected'
               AND product_id = NEW.product_id AND tank_id IS NOT DISTINCT FROM NEW.tank_id
               AND station_id IS NOT DISTINCT FROM NEW.station_id AND depot_id IS NOT DISTINCT FROM NEW.depot_id) THEN
      RAISE EXCEPTION 'Un stock initial existe déjà : utilisez un ajustement';
    END IF;
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSE
    NEW.status := 'validated';
  END IF;

  IF NEW.status = 'validated' THEN
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') AND NEW.quantity > avail THEN
      RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
    END IF;
    IF NEW.movement_type IN ('entry','transfer_in','initial','adjustment_in') AND tk.capacity_liters IS NOT NULL
       AND avail + NEW.quantity > tk.capacity_liters THEN
      RAISE EXCEPTION 'Capacité de la cuve dépassée (% L)', tk.capacity_liters;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.stock_movement_before() FROM PUBLIC, anon;