CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.role_permissions rp ON rp.role_id = ura.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ura.user_id = _user_id
        AND p.code = _permission_code
    )
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

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;