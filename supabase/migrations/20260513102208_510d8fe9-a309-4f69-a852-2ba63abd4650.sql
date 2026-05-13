
CREATE TABLE public.pump_index_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.index_entries(id) ON DELETE CASCADE,
  pump_id uuid NOT NULL REFERENCES public.pumps(id) ON DELETE RESTRICT,
  tank_id uuid REFERENCES public.tanks(id) ON DELETE SET NULL,
  station_id uuid NOT NULL,
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('super','gasoil')),
  index_depart numeric NOT NULL DEFAULT 0,
  index_arrivee numeric NOT NULL DEFAULT 0,
  liters_sold numeric GENERATED ALWAYS AS (GREATEST(index_arrivee - index_depart, 0)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, pump_id)
);

CREATE INDEX idx_pump_index_entries_station_date ON public.pump_index_entries(station_id, entry_date);
CREATE INDEX idx_pump_index_entries_tank_date ON public.pump_index_entries(tank_id, entry_date);
CREATE INDEX idx_pump_index_entries_pump_date ON public.pump_index_entries(pump_id, entry_date);

ALTER TABLE public.pump_index_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View pump index entries"
  ON public.pump_index_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Insert own pump index entries"
  ON public.pump_index_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own pump index entries"
  ON public.pump_index_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Delete own pump index entries"
  ON public.pump_index_entries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Validation trigger: pump must belong to station, tank must match pump
CREATE OR REPLACE FUNCTION public.validate_pump_index_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p_station uuid;
  _p_tank uuid;
  _p_product text;
BEGIN
  IF NEW.index_depart < 0 OR NEW.index_arrivee < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour les index';
  END IF;
  SELECT station_id, tank_id, product_type INTO _p_station, _p_tank, _p_product
  FROM public.pumps WHERE id = NEW.pump_id;
  IF _p_station IS NULL THEN
    RAISE EXCEPTION 'Pompe introuvable';
  END IF;
  IF _p_station <> NEW.station_id THEN
    RAISE EXCEPTION 'La pompe doit appartenir à la station de la saisie';
  END IF;
  IF _p_product <> NEW.product_type THEN
    RAISE EXCEPTION 'Le type de produit doit correspondre à la pompe';
  END IF;
  IF NEW.tank_id IS NOT NULL AND _p_tank IS NOT NULL AND NEW.tank_id <> _p_tank THEN
    RAISE EXCEPTION 'La cuve doit correspondre à la liaison pompe/cuve';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pump_index_validate
BEFORE INSERT OR UPDATE ON public.pump_index_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_pump_index_entry();

CREATE TRIGGER trg_pump_index_fiscal_year
BEFORE INSERT OR UPDATE ON public.pump_index_entries
FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_year_open();

CREATE TRIGGER trg_pump_index_updated_at
BEFORE UPDATE ON public.pump_index_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Aggregated view per tank per day
CREATE OR REPLACE VIEW public.tank_destocking_daily
WITH (security_invoker = true)
AS
SELECT
  station_id,
  tank_id,
  product_type,
  entry_date,
  SUM(liters_sold)::numeric AS total_liters
FROM public.pump_index_entries
WHERE tank_id IS NOT NULL
GROUP BY station_id, tank_id, product_type, entry_date;
