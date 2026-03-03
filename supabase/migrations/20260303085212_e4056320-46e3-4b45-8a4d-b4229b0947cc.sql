
-- Table d'assignation opérateur-station
CREATE TABLE public.station_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, station_id)
);

ALTER TABLE public.station_assignments ENABLE ROW LEVEL SECURITY;

-- Admins et managers peuvent voir toutes les assignations
CREATE POLICY "Admins and managers can view assignments"
ON public.station_assignments FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Les utilisateurs peuvent voir leurs propres assignations
CREATE POLICY "Users can view own assignments"
ON public.station_assignments FOR SELECT
USING (auth.uid() = user_id);

-- Seuls les admins peuvent gérer les assignations
CREATE POLICY "Admins can insert assignments"
ON public.station_assignments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assignments"
ON public.station_assignments FOR DELETE
USING (has_role(auth.uid(), 'admin'));
