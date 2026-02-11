
-- Drop the restrictive SELECT policy on index_entries
DROP POLICY IF EXISTS "Users can view their own index entries" ON public.index_entries;

-- Create a new SELECT policy: users see their own data, admins/managers see all
CREATE POLICY "Users can view index entries"
ON public.index_entries
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'manager')
);
