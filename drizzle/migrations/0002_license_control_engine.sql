ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS expiry_policy text NOT NULL DEFAULT 'read_only';
ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_expiry_policy_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_expiry_policy_check CHECK (expiry_policy IN ('read_only','limited'));

CREATE OR REPLACE FUNCTION public.tenant_license_state(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; l record; mode text; eff text; days int; res jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_platform_admin(auth.uid()) OR public.can_access_tenant(auth.uid(), _tenant_id)) THEN
    RETURN NULL;
  END IF;
  SELECT id, status INTO t FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT li.*, COALESCE(li.max_users, p.max_users) AS lim_users, COALESCE(li.max_countries, p.max_countries) AS lim_countries,
         COALESCE(li.max_stations, p.max_stations) AS lim_stations, p.name AS plan_name
    INTO l FROM public.licenses li JOIN public.license_plans p ON p.id = li.plan_id
   WHERE li.tenant_id = _tenant_id AND li.status <> 'draft'
   ORDER BY (li.status = 'terminated'), li.created_at DESC LIMIT 1;

  IF t.status <> 'active' THEN mode := 'blocked';
  ELSIF l.id IS NULL THEN mode := 'full';
  ELSIF l.status IN ('suspended','terminated') THEN mode := l.expiry_policy;
  ELSIF CURRENT_DATE > l.expiration_date + l.grace_period_days THEN mode := l.expiry_policy;
  ELSIF CURRENT_DATE > l.expiration_date THEN mode := 'grace';
  ELSE mode := 'full'; END IF;

  IF l.id IS NOT NULL THEN
    eff := public.license_effective_status(l.status, l.expiration_date, l.grace_period_days);
    days := l.expiration_date - CURRENT_DATE;
  END IF;

  res := jsonb_build_object(
    'tenant_status', t.status, 'mode', mode, 'has_license', l.id IS NOT NULL,
    'license_id', l.id, 'license_number', l.license_number, 'plan_name', l.plan_name,
    'status', eff, 'expiration_date', l.expiration_date, 'grace_period_days', l.grace_period_days,
    'grace_end', l.expiration_date + l.grace_period_days, 'days_left', days, 'expiry_policy', l.expiry_policy,
    'max_users', l.lim_users, 'max_countries', l.lim_countries, 'max_stations', l.lim_stations,
    'users', (SELECT count(*) FROM public.profiles WHERE tenant_id = _tenant_id AND is_active),
    'countries', (SELECT count(*) FROM public.tenant_countries WHERE tenant_id = _tenant_id AND is_active),
    'stations', (SELECT count(*) FROM public.stations WHERE tenant_id = _tenant_id));
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.tenant_license_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_license_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tenant_write_allowed(_tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t_status text; l record;
BEGIN
  IF _tenant_id IS NULL OR public.is_platform_admin(auth.uid()) THEN RETURN true; END IF;
  SELECT status INTO t_status FROM public.tenants WHERE id = _tenant_id;
  IF t_status IS DISTINCT FROM 'active' THEN RETURN false; END IF;
  SELECT status, expiration_date, grace_period_days INTO l FROM public.licenses
   WHERE tenant_id = _tenant_id AND status <> 'draft'
   ORDER BY (status = 'terminated'), created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN true; END IF;
  IF l.status IN ('suspended','terminated') THEN RETURN false; END IF;
  RETURN CURRENT_DATE <= l.expiration_date + l.grace_period_days;
END $$;
REVOKE ALL ON FUNCTION public.tenant_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_write_allowed(uuid) TO authenticated;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clients','depotages','fiscal_years','index_entries','orders','perequation_entries','perequation_rates','perequation_zones','price_structures','pump_index_entries','pumps','stations','suppliers','supplies','tanks','trucks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "License write insert" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "License write update" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "License write delete" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', tbl);
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id)) WITH CHECK (public.tenant_write_allowed(tenant_id))', tbl);
    EXECUTE format('CREATE POLICY "License write delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.tenant_write_allowed(tenant_id))', tbl);
  END LOOP;
END $$;