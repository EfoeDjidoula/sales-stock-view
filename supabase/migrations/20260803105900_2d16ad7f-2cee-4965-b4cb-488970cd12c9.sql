-- =====================================================================
-- PHASE P0 : socle multi-tenant / multi-pays (additif, réversible)
-- Aucune table existante n'est modifiée.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. TENANTS
-- ---------------------------------------------------------------
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  status text NOT NULL DEFAULT 'active',
  plan text NOT NULL DEFAULT 'standard',
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tenants"
  ON public.tenants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert tenants"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenants"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenants"
  ON public.tenants FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 2. COUNTRIES (référentiel global : devise, fiscalité, i18n)
-- ---------------------------------------------------------------
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,                 -- ISO 3166-1 alpha-2, ex: BJ
  name text NOT NULL,
  currency_code text NOT NULL DEFAULT 'XOF',
  currency_symbol text NOT NULL DEFAULT 'FCFA',
  currency_decimals integer NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,       -- ex: 0.18
  locale text NOT NULL DEFAULT 'fr-FR',
  date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  fuel_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view countries"
  ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert countries"
  ON public.countries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update countries"
  ON public.countries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete countries"
  ON public.countries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 3. TENANT_COUNTRIES (pays exploités par un tenant)
-- ---------------------------------------------------------------
CREATE TABLE public.tenant_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id)
);
CREATE UNIQUE INDEX tenant_countries_one_default
  ON public.tenant_countries (tenant_id) WHERE is_default;

GRANT SELECT ON public.tenant_countries TO authenticated;
GRANT ALL ON public.tenant_countries TO service_role;
ALTER TABLE public.tenant_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tenant countries"
  ON public.tenant_countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert tenant countries"
  ON public.tenant_countries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant countries"
  ON public.tenant_countries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant countries"
  ON public.tenant_countries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenant_countries_updated_at
  BEFORE UPDATE ON public.tenant_countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 4. USER_COUNTRY_ACCESS (portée pays d'un utilisateur)
-- ---------------------------------------------------------------
CREATE TABLE public.user_country_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, country_id)
);

GRANT SELECT ON public.user_country_access TO authenticated;
GRANT ALL ON public.user_country_access TO service_role;
ALTER TABLE public.user_country_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own country access"
  ON public.user_country_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert country access"
  ON public.user_country_access FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update country access"
  ON public.user_country_access FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete country access"
  ON public.user_country_access FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------
-- 5. TENANT_MODULES (activation des modules par tenant)
-- ---------------------------------------------------------------
CREATE TABLE public.tenant_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  allowed_roles app_role[] NOT NULL DEFAULT ARRAY['admin','manager','operator']::app_role[],
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key)
);

GRANT SELECT ON public.tenant_modules TO authenticated;
GRANT ALL ON public.tenant_modules TO service_role;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tenant modules"
  ON public.tenant_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert tenant modules"
  ON public.tenant_modules FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update tenant modules"
  ON public.tenant_modules FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete tenant modules"
  ON public.tenant_modules FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenant_modules_updated_at
  BEFORE UPDATE ON public.tenant_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 6. TENANT_BRANDING (identité visuelle et mentions par tenant)
-- ---------------------------------------------------------------
CREATE TABLE public.tenant_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  legal_name text,
  logo_url text,
  favicon_url text,
  primary_color text NOT NULL DEFAULT '25 95% 53%',
  accent_color text NOT NULL DEFAULT '38 92% 50%',
  app_title text,
  app_description text,
  contact_email text,
  contact_phone text,
  address text,
  tax_id text,
  footer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenant_branding TO authenticated;
GRANT SELECT ON public.tenant_branding TO anon;
GRANT ALL ON public.tenant_branding TO service_role;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view branding"
  ON public.tenant_branding FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert branding"
  ON public.tenant_branding FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update branding"
  ON public.tenant_branding FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete branding"
  ON public.tenant_branding FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenant_branding_updated_at
  BEFORE UPDATE ON public.tenant_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- 7. Index de support
-- ---------------------------------------------------------------
CREATE INDEX idx_tenant_countries_tenant ON public.tenant_countries(tenant_id);
CREATE INDEX idx_user_country_access_user ON public.user_country_access(user_id);
CREATE INDEX idx_tenant_modules_tenant ON public.tenant_modules(tenant_id);
