-- 1. Helper: accès pays dans le contexte d'un tenant
CREATE OR REPLACE FUNCTION public.can_access_tenant_country(_user_id uuid, _tenant_id uuid, _country_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR (
      public.can_access_tenant(_user_id, _tenant_id)
      AND (
        _country_id IS NULL
        OR (
          EXISTS (
            SELECT 1 FROM public.tenant_countries tc
            WHERE tc.tenant_id = _tenant_id
              AND tc.country_id = _country_id
              AND tc.is_active
          )
          AND (
            NOT EXISTS (SELECT 1 FROM public.user_country_access u WHERE u.user_id = _user_id)
            OR EXISTS (
              SELECT 1 FROM public.user_country_access u
              WHERE u.user_id = _user_id AND u.country_id = _country_id
            )
          )
        )
      )
    )
$$;

-- 2. Helper: deux utilisateurs du même tenant
CREATE OR REPLACE FUNCTION public.shares_tenant_with(_user_id uuid, _other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR _user_id = _other_user_id
    OR (
      public.get_user_tenant(_user_id) IS NOT NULL
      AND public.get_user_tenant(_user_id) = public.get_user_tenant(_other_user_id)
    )
$$;

-- 3. Couche RESTRICTIVE tenant + pays sur toutes les tables métier
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','depotages','fiscal_years','index_entries','orders',
    'perequation_entries','perequation_rates','perequation_zones',
    'price_structures','pump_index_entries','pumps','stations',
    'suppliers','supplies','tanks','trucks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Strict tenant country isolation" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "Strict tenant country isolation"
      ON public.%I
      AS RESTRICTIVE
      FOR ALL TO authenticated
      USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))
      WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))
    $f$, t);
  END LOOP;
END $$;

-- 4. Tables cadrées tenant uniquement
DROP POLICY IF EXISTS "Strict tenant isolation" ON public.profiles;
CREATE POLICY "Strict tenant isolation" ON public.profiles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (user_id = auth.uid() OR public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Strict tenant isolation" ON public.tenant_branding;
CREATE POLICY "Strict tenant isolation" ON public.tenant_branding
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Strict tenant isolation" ON public.tenant_countries;
CREATE POLICY "Strict tenant isolation" ON public.tenant_countries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Strict tenant isolation" ON public.tenant_modules;
CREATE POLICY "Strict tenant isolation" ON public.tenant_modules
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Strict tenant isolation" ON public.user_country_access;
CREATE POLICY "Strict tenant isolation" ON public.user_country_access
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Strict tenant isolation" ON public.tenants;
CREATE POLICY "Strict tenant isolation" ON public.tenants
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), id))
  WITH CHECK (public.can_access_tenant(auth.uid(), id));

-- 5. Affectations de stations : soi-même ou stations de sa société
DROP POLICY IF EXISTS "Strict tenant isolation" ON public.station_assignments;
CREATE POLICY "Strict tenant isolation" ON public.station_assignments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stations s
      WHERE s.id = station_assignments.station_id
        AND public.can_access_tenant(auth.uid(), s.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stations s
      WHERE s.id = station_assignments.station_id
        AND public.can_access_tenant(auth.uid(), s.tenant_id)
    )
  );

-- 6. Rôles : soi-même ou utilisateurs de sa société
DROP POLICY IF EXISTS "Strict tenant isolation" ON public.user_roles;
CREATE POLICY "Strict tenant isolation" ON public.user_roles
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.shares_tenant_with(auth.uid(), user_id))
  WITH CHECK (public.shares_tenant_with(auth.uid(), user_id));