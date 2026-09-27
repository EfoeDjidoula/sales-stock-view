CREATE OR REPLACE FUNCTION public.can_write_module(_user_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.role_permissions rp ON rp.role_id = ura.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ura.user_id = _user_id AND p.module = _module
      AND p.action IN ('create','edit','validate','delete','administer'))
$$;
REVOKE EXECUTE ON FUNCTION public.can_write_module(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_module(uuid, text) TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('clients','clients'),('suppliers','suppliers'),('stations','stations'),('tanks','stations'),
    ('pumps','stations'),('index_entries','index_entries'),('pump_index_entries','index_entries'),
    ('orders','orders'),('supplies','supplies'),('depotages','depotages'),('trucks','trucks'),
    ('perequation_entries','perequation'),('perequation_rates','perequation'),('perequation_zones','perequation'),
    ('price_structures','price_structures'),('fiscal_years','fiscal_years')) AS t(tbl, mod)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "RBAC write insert" ON public.%I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "RBAC write update" ON public.%I', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS "RBAC write delete" ON public.%I', r.tbl);
    EXECUTE format('CREATE POLICY "RBAC write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), %L))', r.tbl, r.mod);
    EXECUTE format('CREATE POLICY "RBAC write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), %L))', r.tbl, r.mod);
    EXECUTE format('CREATE POLICY "RBAC write delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), %L))', r.tbl, r.mod);
  END LOOP;
END $$;