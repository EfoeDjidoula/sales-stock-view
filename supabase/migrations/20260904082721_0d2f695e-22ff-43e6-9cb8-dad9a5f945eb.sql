CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR (
      _tenant_id IS NOT NULL
      AND _tenant_id = public.get_user_tenant(_user_id)
    )
$$;

REVOKE ALL ON FUNCTION public.can_access_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_tenant(uuid, uuid) TO authenticated, service_role;