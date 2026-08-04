
REVOKE EXECUTE ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_tenant(uuid, uuid) TO authenticated, service_role;
