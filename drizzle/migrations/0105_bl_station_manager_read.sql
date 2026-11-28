CREATE POLICY "Station manager BL read" ON public.logistics_delivery_notes FOR SELECT TO authenticated
USING (station_id IS NOT NULL AND public.can_access_tenant_country(auth.uid(), tenant_id, country_id)
  AND public.has_permission(auth.uid(), 'depotages.view')
  AND EXISTS (SELECT 1 FROM public.station_assignments sa WHERE sa.user_id = auth.uid() AND sa.station_id = logistics_delivery_notes.station_id));