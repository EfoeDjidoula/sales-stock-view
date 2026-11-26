CREATE OR REPLACE FUNCTION public.station_in_my_scope(_station_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _station_id IS NULL OR auth.uid() IS NULL OR public.is_platform_admin(auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.station_assignments WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.station_assignments WHERE user_id = auth.uid() AND station_id = _station_id)
$$;
REVOKE ALL ON FUNCTION public.station_in_my_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.station_in_my_scope(uuid) TO authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_closures','index_entries','index_tank_readings','pump_index_entries','depotages','orders','supplies','supply_requests','support_tickets','hse_events','hse_inspections','hse_nonconformities','hse_safety_items','logistics_discharges','stock_movements','reconciliations','account_closings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Station scope insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Station scope update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Station scope insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.station_in_my_scope(station_id))', t);
    EXECUTE format('CREATE POLICY "Station scope update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.station_in_my_scope(station_id)) WITH CHECK (public.station_in_my_scope(station_id))', t);
  END LOOP;
END $$;