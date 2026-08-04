DROP POLICY IF EXISTS "Authenticated can view clients" ON public.clients;
CREATE POLICY "Owner or admin/manager can view clients"
ON public.clients FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);

DROP POLICY IF EXISTS "Authenticated can view suppliers" ON public.suppliers;
CREATE POLICY "Owner or admin/manager can view suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);