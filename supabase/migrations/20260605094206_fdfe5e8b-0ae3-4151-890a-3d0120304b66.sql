
CREATE TABLE public.trucks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  driver_name text NOT NULL,
  registration text NOT NULL,
  nominal_capacity numeric NOT NULL DEFAULT 0,
  compartment_count integer NOT NULL DEFAULT 1,
  compartments jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trucks TO authenticated;
GRANT ALL ON public.trucks TO service_role;

ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view trucks"
  ON public.trucks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can create their own trucks"
  ON public.trucks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner or admin/manager can update trucks"
  ON public.trucks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Owner or admin/manager can delete trucks"
  ON public.trucks FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_trucks_updated_at
  BEFORE UPDATE ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.depotages
  ADD COLUMN truck_id uuid,
  ADD COLUMN stock_before numeric NOT NULL DEFAULT 0,
  ADD COLUMN gauge_after numeric NOT NULL DEFAULT 0,
  ADD COLUMN start_time time,
  ADD COLUMN end_time time,
  ADD COLUMN stock_theoretical numeric GENERATED ALWAYS AS (stock_before + quantity_unloaded) STORED,
  ADD COLUMN depotage_ecart numeric GENERATED ALWAYS AS (gauge_after - (stock_before + quantity_unloaded)) STORED;
