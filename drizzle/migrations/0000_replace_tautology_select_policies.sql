DROP POLICY IF EXISTS "Authenticated can view tenants" ON public.tenants;
CREATE POLICY "Authenticated can view tenants" ON public.tenants FOR SELECT TO authenticated USING (public.can_access_tenant(auth.uid(), id));

DROP POLICY IF EXISTS "Modules readable by authenticated" ON public.modules;
CREATE POLICY "Modules readable by authenticated" ON public.modules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permissions readable by authenticated" ON public.permissions;
CREATE POLICY "Permissions readable by authenticated" ON public.permissions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can view countries" ON public.countries;
CREATE POLICY "Authenticated can view countries" ON public.countries FOR SELECT TO authenticated USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (SELECT 1 FROM public.tenant_countries tc WHERE tc.country_id = countries.id AND tc.tenant_id = public.get_user_tenant(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can view tenant modules" ON public.tenant_modules;
CREATE POLICY "Authenticated can view tenant modules" ON public.tenant_modules FOR SELECT TO authenticated USING (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Authenticated can view tenant countries" ON public.tenant_countries;
CREATE POLICY "Authenticated can view tenant countries" ON public.tenant_countries FOR SELECT TO authenticated USING (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Anyone can view branding" ON public.tenant_branding;
CREATE POLICY "Tenant members can view branding" ON public.tenant_branding FOR SELECT TO authenticated USING (public.can_access_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Authenticated can view entries" ON public.perequation_entries;
CREATE POLICY "Authenticated can view entries" ON public.perequation_entries FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Authenticated can view price structures" ON public.price_structures;
CREATE POLICY "Authenticated can view price structures" ON public.price_structures FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Authenticated can view trucks" ON public.trucks;
CREATE POLICY "Authenticated can view trucks" ON public.trucks FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Authenticated users can view fiscal years" ON public.fiscal_years;
CREATE POLICY "Authenticated users can view fiscal years" ON public.fiscal_years FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Stations are viewable by authenticated users" ON public.stations;
CREATE POLICY "Stations are viewable by authenticated users" ON public.stations FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Authenticated can view zones" ON public.perequation_zones;
CREATE POLICY "Authenticated can view zones" ON public.perequation_zones FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Pumps viewable by authenticated" ON public.pumps;
CREATE POLICY "Pumps viewable by authenticated" ON public.pumps FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Authenticated can view rates" ON public.perequation_rates;
CREATE POLICY "Authenticated can view rates" ON public.perequation_rates FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

DROP POLICY IF EXISTS "Tanks viewable by authenticated" ON public.tanks;
CREATE POLICY "Tanks viewable by authenticated" ON public.tanks FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));