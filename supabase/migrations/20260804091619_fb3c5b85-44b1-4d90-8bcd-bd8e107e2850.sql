-- 1. Extend tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#F59E0B',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#1F2937',
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS default_language text NOT NULL DEFAULT 'fr';

UPDATE public.tenants SET code = upper(replace(slug, '-', '_')) WHERE code IS NULL;
UPDATE public.tenants SET trade_name = name WHERE trade_name IS NULL;

ALTER TABLE public.tenants ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN trade_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_code_key ON public.tenants (code);

UPDATE public.tenants SET status = 'active' WHERE status NOT IN ('active','suspended','archived');

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active','suspended','archived'));

-- Sync branding already configured for the current company
UPDATE public.tenants t
SET logo_url = COALESCE(t.logo_url, b.logo_url),
    address = COALESCE(t.address, b.address),
    phone = COALESCE(t.phone, b.contact_phone),
    email = COALESCE(t.email, b.contact_email),
    primary_color = COALESCE(b.primary_color, t.primary_color),
    secondary_color = COALESCE(b.accent_color, t.secondary_color),
    trade_name = COALESCE(b.display_name, t.trade_name)
FROM public.tenant_branding b
WHERE b.tenant_id = t.id;

-- 2. Add tenant_id to business tables, backfilled + defaulted to the current company
DO $$
DECLARE
  _tenant uuid;
  _t text;
  _tables text[] := ARRAY[
    'stations','tanks','pumps','index_entries','pump_index_entries','depotages',
    'orders','supplies','clients','suppliers','trucks','perequation_zones',
    'perequation_rates','perequation_entries','price_structures','fiscal_years','profiles'
  ];
BEGIN
  SELECT id INTO _tenant FROM public.tenants WHERE slug = 'yatt-co-energy';

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)', _t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', _t, _tenant);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT %L', _t, _tenant);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', _t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', _t || '_tenant_id_idx', _t);
  END LOOP;
END $$;