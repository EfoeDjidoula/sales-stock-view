CREATE TABLE public.depotages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  station_id uuid NOT NULL,
  tank_id uuid,
  product_type text NOT NULL DEFAULT 'super',
  truck_registration text NOT NULL,
  truck_nominal_capacity numeric NOT NULL DEFAULT 0,
  tank_capacity_liters numeric NOT NULL DEFAULT 0,
  quantity_to_unload numeric NOT NULL DEFAULT 0,
  quantity_unloaded numeric NOT NULL DEFAULT 0,
  tolerance_rate numeric NOT NULL DEFAULT 0.5,
  ecart numeric GENERATED ALWAYS AS (quantity_unloaded - quantity_to_unload) STORED,
  depotage_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.depotages TO authenticated;
GRANT ALL ON public.depotages TO service_role;

ALTER TABLE public.depotages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view depotages"
  ON public.depotages FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Users can create their own depotages"
  ON public.depotages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own depotages"
  ON public.depotages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own depotages"
  ON public.depotages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.validate_depotage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t_station uuid;
BEGIN
  IF NEW.truck_nominal_capacity < 0 OR NEW.tank_capacity_liters < 0
     OR NEW.quantity_to_unload < 0 OR NEW.quantity_unloaded < 0
     OR NEW.tolerance_rate < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour le dépotage';
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
$$;

CREATE TRIGGER validate_depotage_trigger
  BEFORE INSERT OR UPDATE ON public.depotages
  FOR EACH ROW EXECUTE FUNCTION public.validate_depotage();

CREATE TRIGGER update_depotages_updated_at
  BEFORE UPDATE ON public.depotages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();