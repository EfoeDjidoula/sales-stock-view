
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id IS NOT NULL
    AND (
      _tenant_id = public.get_user_tenant(_user_id)
      OR public.has_role(_user_id, 'admin'::app_role)
    )
$$;

DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','depotages','fiscal_years','index_entries','orders',
    'perequation_entries','perequation_rates','perequation_zones',
    'price_structures','profiles','pump_index_entries','pumps','stations',
    'suppliers','supplies','tanks','tenant_branding','tenant_countries',
    'tenant_modules','trucks','user_country_access'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Tenant isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.can_access_tenant(auth.uid(), tenant_id))
         WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id))', t);
  END LOOP;
END
$do$;

DROP POLICY IF EXISTS "Admins can update tenants" ON public.tenants;
CREATE POLICY "Admins can update tenants" ON public.tenants
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
