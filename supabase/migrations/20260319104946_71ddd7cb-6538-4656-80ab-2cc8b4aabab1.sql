
-- Fix: Change index_entries SELECT policy role from public to authenticated
DROP POLICY IF EXISTS "Users can view index entries" ON public.index_entries;
CREATE POLICY "Users can view index entries"
ON public.index_entries
FOR SELECT
TO authenticated
USING (
  (auth.uid() = user_id)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);
