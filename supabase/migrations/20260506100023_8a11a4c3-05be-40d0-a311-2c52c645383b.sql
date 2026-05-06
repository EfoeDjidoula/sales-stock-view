-- Zones de péréquation transport
CREATE TABLE public.perequation_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.perequation_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view zones" ON public.perequation_zones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can insert zones" ON public.perequation_zones
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "Admin/Manager can update zones" ON public.perequation_zones
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "Admin can delete zones" ON public.perequation_zones
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_perequation_zones_updated_at
BEFORE UPDATE ON public.perequation_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Taux de péréquation par zone et produit
CREATE TABLE public.perequation_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.perequation_zones(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('super','gasoil')),
  rate_per_liter numeric NOT NULL DEFAULT 0 CHECK (rate_per_liter >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.perequation_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rates" ON public.perequation_rates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can insert rates" ON public.perequation_rates
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "Admin/Manager can update rates" ON public.perequation_rates
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "Admin can delete rates" ON public.perequation_rates
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_perequation_rates_updated_at
BEFORE UPDATE ON public.perequation_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ajouter zone_id sur stations (optionnel)
ALTER TABLE public.stations ADD COLUMN zone_id uuid REFERENCES public.perequation_zones(id) ON DELETE SET NULL;

-- Entrées de péréquation transport
CREATE TABLE public.perequation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  station_id uuid NOT NULL,
  supply_id uuid REFERENCES public.supplies(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.perequation_zones(id) ON DELETE SET NULL,
  product_type text NOT NULL CHECK (product_type IN ('super','gasoil')),
  quantity_liters numeric NOT NULL DEFAULT 0 CHECK (quantity_liters >= 0),
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  bl_number text,
  rate_per_liter numeric NOT NULL DEFAULT 0 CHECK (rate_per_liter >= 0),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received')),
  received_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perequation_entries_station ON public.perequation_entries(station_id);
CREATE INDEX idx_perequation_entries_date ON public.perequation_entries(delivery_date);
CREATE INDEX idx_perequation_entries_status ON public.perequation_entries(status);

ALTER TABLE public.perequation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view entries" ON public.perequation_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Manager can insert entries" ON public.perequation_entries
  FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)) AND auth.uid() = user_id);
CREATE POLICY "Admin/Manager can update entries" ON public.perequation_entries
  FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE POLICY "Admin can delete entries" ON public.perequation_entries
  FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER update_perequation_entries_updated_at
BEFORE UPDATE ON public.perequation_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();