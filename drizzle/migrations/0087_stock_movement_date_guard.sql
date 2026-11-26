CREATE OR REPLACE FUNCTION public.stock_movement_date_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.movement_date IS NULL THEN NEW.movement_date := now(); END IF;
  IF NEW.movement_date > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'La date du mouvement ne peut pas être dans le futur';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_movement_date_guard ON public.stock_movements;
CREATE TRIGGER stock_movement_date_guard BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.stock_movement_date_guard();