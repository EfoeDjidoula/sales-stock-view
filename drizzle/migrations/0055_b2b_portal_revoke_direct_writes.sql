REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.b2b_portal_users FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.b2b_portal_requests FROM anon, authenticated;
REVOKE ALL ON public.b2b_portal_users FROM anon;
REVOKE ALL ON public.b2b_portal_requests FROM anon;