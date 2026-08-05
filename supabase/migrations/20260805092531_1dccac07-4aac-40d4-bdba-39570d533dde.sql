CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = _user_id)
$$;

DROP POLICY IF EXISTS "Platform admins can view platform admins" ON public.platform_admins;
CREATE POLICY "Platform admins can view platform admins"
ON public.platform_admins FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can manage platform admins" ON public.platform_admins;
CREATE POLICY "Platform admins can manage platform admins"
ON public.platform_admins FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Accès transversal du Super Admin LUMATEK
CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR (
      _tenant_id IS NOT NULL
      AND (
        _tenant_id = public.get_user_tenant(_user_id)
        OR public.has_role(_user_id, 'admin'::app_role)
      )
    )
$$;

DROP POLICY IF EXISTS "Platform admins can manage tenants" ON public.tenants;
CREATE POLICY "Platform admins can manage tenants"
ON public.tenants FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

-- Initialisation : admin(s) rattaché(s) au tenant LUMATEK
INSERT INTO public.platform_admins (user_id)
SELECT p.user_id
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'admin'::app_role
WHERE t.slug = 'lumatek' OR t.code = 'LUMATEK'
ON CONFLICT (user_id) DO NOTHING;