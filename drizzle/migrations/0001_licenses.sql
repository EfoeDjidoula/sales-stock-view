CREATE TABLE public.license_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  max_users integer CHECK (max_users IS NULL OR max_users >= 0),
  max_countries integer CHECK (max_countries IS NULL OR max_countries >= 0),
  max_stations integer CHECK (max_stations IS NULL OR max_stations >= 0),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_plans TO authenticated;
GRANT ALL ON public.license_plans TO service_role;
ALTER TABLE public.license_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read plans" ON public.license_plans FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Platform admin manage plans" ON public.license_plans FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.license_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.license_plans(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, module_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_modules TO authenticated;
GRANT ALL ON public.license_modules TO service_role;
ALTER TABLE public.license_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read plan modules" ON public.license_modules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Platform admin manage plan modules" ON public.license_modules FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_number text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.license_plans(id) ON DELETE RESTRICT,
  activation_date date,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date NOT NULL,
  grace_period_days integer NOT NULL DEFAULT 15 CHECK (grace_period_days >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expiring','expired','suspended','terminated')),
  max_users integer CHECK (max_users IS NULL OR max_users >= 0),
  max_countries integer CHECK (max_countries IS NULL OR max_countries >= 0),
  max_stations integer CHECK (max_stations IS NULL OR max_stations >= 0),
  automatic_renewal boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expiration_date >= start_date)
);
CREATE UNIQUE INDEX licenses_one_open_per_tenant ON public.licenses(tenant_id) WHERE status <> 'terminated';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read own license" ON public.licenses FOR SELECT TO authenticated USING (public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Platform admin manage licenses" ON public.licenses FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_license_number() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.license_number IS NULL OR btrim(NEW.license_number) = '' THEN
    NEW.license_number := 'LIC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  END IF;
  IF NEW.status = 'active' AND NEW.activation_date IS NULL THEN NEW.activation_date := CURRENT_DATE; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER licenses_number BEFORE INSERT OR UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.set_license_number();
CREATE TRIGGER licenses_updated BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER license_plans_updated BEFORE UPDATE ON public.license_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Statut effectif (calculé selon les dates)
CREATE OR REPLACE FUNCTION public.license_effective_status(_status text, _expiration date, _grace integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _status IN ('draft','suspended','terminated') THEN _status
    WHEN CURRENT_DATE > _expiration + COALESCE(_grace,0) THEN 'expired'
    WHEN CURRENT_DATE > _expiration - 30 THEN 'expiring'
    WHEN _status = 'expired' THEN 'expired'
    ELSE 'active' END
$$;

-- Licence courante d'un tenant avec limites effectives
CREATE OR REPLACE FUNCTION public.tenant_license_limits(_tenant_id uuid)
RETURNS TABLE(license_id uuid, plan_id uuid, status text, max_users integer, max_countries integer, max_stations integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.plan_id,
    public.license_effective_status(l.status, l.expiration_date, l.grace_period_days),
    COALESCE(l.max_users, p.max_users), COALESCE(l.max_countries, p.max_countries), COALESCE(l.max_stations, p.max_stations)
  FROM public.licenses l JOIN public.license_plans p ON p.id = l.plan_id
  WHERE l.tenant_id = _tenant_id AND l.status NOT IN ('terminated','draft')
  ORDER BY l.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.enforce_license_limits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim record; cnt integer;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO lim FROM public.tenant_license_limits(NEW.tenant_id);
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NOT NEW.is_active OR (TG_OP = 'UPDATE' AND OLD.is_active AND OLD.tenant_id = NEW.tenant_id) THEN RETURN NEW; END IF;
    IF lim.max_users IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM public.profiles WHERE tenant_id = NEW.tenant_id AND is_active AND id <> NEW.id;
      IF cnt >= lim.max_users THEN RAISE EXCEPTION 'Limite de licence atteinte : % utilisateur(s) actif(s) maximum', lim.max_users USING ERRCODE = 'check_violation'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'tenant_countries' THEN
    IF NOT NEW.is_active OR (TG_OP = 'UPDATE' AND OLD.is_active) THEN RETURN NEW; END IF;
    IF lim.max_countries IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM public.tenant_countries WHERE tenant_id = NEW.tenant_id AND is_active AND id <> NEW.id;
      IF cnt >= lim.max_countries THEN RAISE EXCEPTION 'Limite de licence atteinte : % pays maximum', lim.max_countries USING ERRCODE = 'check_violation'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'stations' THEN
    IF TG_OP = 'UPDATE' AND OLD.tenant_id = NEW.tenant_id THEN RETURN NEW; END IF;
    IF lim.max_stations IS NOT NULL THEN
      SELECT count(*) INTO cnt FROM public.stations WHERE tenant_id = NEW.tenant_id AND id <> NEW.id;
      IF cnt >= lim.max_stations THEN RAISE EXCEPTION 'Limite de licence atteinte : % station(s) maximum', lim.max_stations USING ERRCODE = 'check_violation'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_license_limit BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_license_limits();
CREATE TRIGGER tenant_countries_license_limit BEFORE INSERT OR UPDATE ON public.tenant_countries FOR EACH ROW EXECUTE FUNCTION public.enforce_license_limits();
CREATE TRIGGER stations_license_limit BEFORE INSERT OR UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION public.enforce_license_limits();

-- Modules : restreints au plan de la licence courante (modules coeur toujours autorisés)
CREATE OR REPLACE FUNCTION public.is_module_enabled(_tenant_id uuid, _country_id uuid, _module_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT
    (
      NOT EXISTS (SELECT 1 FROM public.tenant_license_limits(_tenant_id))
      OR EXISTS (SELECT 1 FROM public.modules m WHERE m.key = _module_key AND m.is_core)
      OR EXISTS (SELECT 1 FROM public.tenant_license_limits(_tenant_id) t
                 JOIN public.license_modules lm ON lm.plan_id = t.plan_id AND lm.module_key = _module_key)
    )
    AND COALESCE(
      (SELECT cm.is_enabled FROM public.country_modules cm
        WHERE cm.tenant_id = _tenant_id AND cm.country_id = _country_id AND cm.module_key = _module_key),
      (SELECT tm.is_enabled FROM public.tenant_modules tm
        WHERE tm.tenant_id = _tenant_id AND tm.module_key = _module_key),
      true)
$function$;

-- Plans par défaut
INSERT INTO public.license_plans (code, name, description, max_users, max_countries, max_stations, is_system, position) VALUES
 ('STANDARD','Standard','Exploitation de base d''un petit réseau',10,1,5,true,1),
 ('PROFESSIONAL','Professional','Réseau multi-stations avec logistique et analyse',50,3,30,true,2),
 ('ENTERPRISE','Enterprise','Tous modules, limites illimitées',NULL,NULL,NULL,true,3);
INSERT INTO public.license_modules (plan_id, module_key)
SELECT p.id, m.key FROM public.license_plans p CROSS JOIN public.modules m
WHERE p.code = 'ENTERPRISE'
   OR (p.code = 'PROFESSIONAL' AND m.category NOT IN ('ia'))
   OR (p.code = 'STANDARD' AND m.position <= 12);
-- Licence ENTERPRISE pour chaque tenant existant (aucune restriction nouvelle)
INSERT INTO public.licenses (license_number, tenant_id, plan_id, status, start_date, expiration_date, activation_date, automatic_renewal, notes)
SELECT NULL, t.id, (SELECT id FROM public.license_plans WHERE code='ENTERPRISE'), 'active', CURRENT_DATE, CURRENT_DATE + 365, CURRENT_DATE, true, 'Licence initiale générée automatiquement'
FROM public.tenants t;