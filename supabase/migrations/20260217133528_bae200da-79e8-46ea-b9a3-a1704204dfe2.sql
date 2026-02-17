
-- Allow managers and admins to view all orders
CREATE POLICY "Managers and admins can view all orders"
ON public.orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Allow managers and admins to view all supplies
CREATE POLICY "Managers and admins can view all supplies"
ON public.supplies
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Allow admins to manage stations
CREATE POLICY "Admins can insert stations"
ON public.stations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update stations"
ON public.stations
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stations"
ON public.stations
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
