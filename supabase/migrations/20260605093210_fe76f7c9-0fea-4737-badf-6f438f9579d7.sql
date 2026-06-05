-- Helper to check station assignment (or elevated role)
CREATE OR REPLACE FUNCTION public.can_write_station(_user_id uuid, _station_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.station_assignments sa
      WHERE sa.user_id = _user_id
        AND sa.station_id = _station_id
    )
$$;
REVOKE EXECUTE ON FUNCTION public.can_write_station(uuid, uuid) FROM anon, authenticated;

-- index_entries
DROP POLICY IF EXISTS "Users can create their own index entries" ON public.index_entries;
CREATE POLICY "Users can create their own index entries"
  ON public.index_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Users can update their own index entries" ON public.index_entries;
CREATE POLICY "Users can update their own index entries"
  ON public.index_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

-- pump_index_entries
DROP POLICY IF EXISTS "Insert own pump index entries" ON public.pump_index_entries;
CREATE POLICY "Insert own pump index entries"
  ON public.pump_index_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Update own pump index entries" ON public.pump_index_entries;
CREATE POLICY "Update own pump index entries"
  ON public.pump_index_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

-- depotages
DROP POLICY IF EXISTS "Users can create their own depotages" ON public.depotages;
CREATE POLICY "Users can create their own depotages"
  ON public.depotages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Users can update their own depotages" ON public.depotages;
CREATE POLICY "Users can update their own depotages"
  ON public.depotages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

-- supplies
DROP POLICY IF EXISTS "Users can create their own supplies" ON public.supplies;
CREATE POLICY "Users can create their own supplies"
  ON public.supplies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Users can update their own supplies" ON public.supplies;
CREATE POLICY "Users can update their own supplies"
  ON public.supplies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

-- orders
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
CREATE POLICY "Users can update their own orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));

-- profiles: remove redundant overly-permissive {public} update policy
DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;

-- Restrict direct execution of role helper (RLS still works via SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated;