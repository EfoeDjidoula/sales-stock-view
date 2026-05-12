
CREATE TABLE public.tanks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('super','gasoil')),
  capacity_liters numeric NOT NULL DEFAULT 0 CHECK (capacity_liters >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, name)
);

CREATE TABLE public.pumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  tank_id uuid REFERENCES public.tanks(id) ON DELETE SET NULL,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('super','gasoil')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, name)
);

CREATE INDEX idx_tanks_station ON public.tanks(station_id);
CREATE INDEX idx_pumps_station ON public.pumps(station_id);
CREATE INDEX idx_pumps_tank ON public.pumps(tank_id);

ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pumps ENABLE ROW LEVEL SECURITY;

-- RLS tanks
CREATE POLICY "Tanks viewable by authenticated" ON public.tanks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert tanks" ON public.tanks
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update tanks" ON public.tanks
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete tanks" ON public.tanks
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- RLS pumps
CREATE POLICY "Pumps viewable by authenticated" ON public.pumps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert pumps" ON public.pumps
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins update pumps" ON public.pumps
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins delete pumps" ON public.pumps
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER trg_tanks_updated_at BEFORE UPDATE ON public.tanks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pumps_updated_at BEFORE UPDATE ON public.pumps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation : pompe ↔ cuve cohérente (même station, même produit)
CREATE OR REPLACE FUNCTION public.validate_pump_tank_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t_station uuid;
  _t_product text;
BEGIN
  IF NEW.tank_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT station_id, product_type INTO _t_station, _t_product
  FROM public.tanks WHERE id = NEW.tank_id;
  IF _t_station IS NULL THEN
    RAISE EXCEPTION 'Cuve introuvable';
  END IF;
  IF _t_station <> NEW.station_id THEN
    RAISE EXCEPTION 'La cuve doit appartenir à la même station que la pompe';
  END IF;
  IF _t_product <> NEW.product_type THEN
    RAISE EXCEPTION 'La cuve et la pompe doivent avoir le même type de produit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pumps_validate_link
  BEFORE INSERT OR UPDATE ON public.pumps
  FOR EACH ROW EXECUTE FUNCTION public.validate_pump_tank_link();
