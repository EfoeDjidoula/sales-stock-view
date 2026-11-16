-- Identity helpers: bind lookups to the caller
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.tenant_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
    AND (
      auth.uid() IS NULL
      OR _user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
      OR p.tenant_id = (SELECT me.tenant_id FROM public.profiles me WHERE me.user_id = auth.uid() LIMIT 1)
    )
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
  AND (
    auth.uid() IS NULL
    OR _user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'admin'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.tenant_id = b.tenant_id
        WHERE a.user_id = auth.uid() AND b.user_id = _user_id AND a.tenant_id IS NOT NULL
      )
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
    AND (
      auth.uid() IS NULL
      OR _user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
      OR (
        EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid() AND me.role = 'admin'::app_role)
        AND EXISTS (
          SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.tenant_id = b.tenant_id
          WHERE a.user_id = auth.uid() AND b.user_id = _user_id AND a.tenant_id IS NOT NULL
        )
      )
    )
  LIMIT 1
$function$;

-- Internal-only helpers (used by SECURITY DEFINER triggers / functions)
REVOKE EXECUTE ON FUNCTION public.tenant_license_limits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_license_limits(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.index_entry_sales_value(uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.index_entry_sales_value(uuid, uuid, uuid, date) TO service_role;

-- Reference catalogues: members of a tenant or platform admins only
DROP POLICY IF EXISTS "Modules readable by authenticated" ON public.modules;
CREATE POLICY "Modules readable by members" ON public.modules FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.get_user_tenant(auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Permissions readable by authenticated" ON public.permissions;
CREATE POLICY "Permissions readable by members" ON public.permissions FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.get_user_tenant(auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated read plan modules" ON public.license_modules;
CREATE POLICY "Members read plan modules" ON public.license_modules FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.get_user_tenant(auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated read plans" ON public.license_plans;
CREATE POLICY "Members read plans" ON public.license_plans FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.get_user_tenant(auth.uid()) IS NOT NULL);