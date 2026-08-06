-- 1. Enrichir countries
ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS iso_code text,
  ADD COLUMN IF NOT EXISTS flag text,
  ADD COLUMN IF NOT EXISTS default_currency text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Porto-Novo',
  ADD COLUMN IF NOT EXISTS default_language text;

UPDATE public.countries
SET iso_code = COALESCE(iso_code, code),
    default_currency = COALESCE(default_currency, currency_code),
    default_language = COALESCE(default_language, split_part(locale, '-', 1)),
    flag = COALESCE(flag, '🇧🇯');

ALTER TABLE public.countries
  ALTER COLUMN iso_code SET NOT NULL,
  ALTER COLUMN default_currency SET NOT NULL,
  ALTER COLUMN default_language SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS countries_iso_code_key ON public.countries (iso_code);

-- 2. Enrichir tenant_countries
ALTER TABLE public.tenant_countries
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tenant_countries
  DROP CONSTRAINT IF EXISTS tenant_countries_status_check;
ALTER TABLE public.tenant_countries
  ADD CONSTRAINT tenant_countries_status_check CHECK (status IN ('active','suspended','archived'));

UPDATE public.tenant_countries tc
SET currency = COALESCE(tc.currency, c.default_currency),
    timezone = COALESCE(tc.timezone, c.timezone),
    language = COALESCE(tc.language, c.default_language)
FROM public.countries c
WHERE c.id = tc.country_id;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_countries_tenant_country_key
  ON public.tenant_countries (tenant_id, country_id);

-- Rattacher tous les tenants existants au Bénin
INSERT INTO public.tenant_countries (tenant_id, country_id, is_default, is_active, currency, timezone, language, status)
SELECT t.id, c.id, true, true, c.default_currency, c.timezone, c.default_language, 'active'
FROM public.tenants t
CROSS JOIN public.countries c
WHERE c.iso_code = 'BJ'
ON CONFLICT (tenant_id, country_id) DO NOTHING;

-- 3. country_id sur les tables opérationnelles
DO $$
DECLARE
  _bj uuid;
  _t text;
  _tables text[] := ARRAY[
    'stations','tanks','pumps','index_entries','pump_index_entries','depotages',
    'orders','supplies','clients','suppliers','trucks','perequation_zones',
    'perequation_rates','perequation_entries','price_structures','fiscal_years','profiles'
  ];
BEGIN
  SELECT id INTO _bj FROM public.countries WHERE iso_code = 'BJ';
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id)', _t);
    EXECUTE format('UPDATE public.%I SET country_id = %L WHERE country_id IS NULL', _t, _bj);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN country_id SET DEFAULT %L', _t, _bj);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, country_id)', _t || '_tenant_country_idx', _t);
  END LOOP;
END $$;

-- 4. Gestion des pays clients par les super admins
DROP POLICY IF EXISTS "Platform admins manage tenant countries" ON public.tenant_countries;
CREATE POLICY "Platform admins manage tenant countries"
ON public.tenant_countries FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_countries TO authenticated;
GRANT ALL ON public.tenant_countries TO service_role;
GRANT SELECT ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;