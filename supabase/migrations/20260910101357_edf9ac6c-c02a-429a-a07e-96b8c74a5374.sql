ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS app_title text,
  ADD COLUMN IF NOT EXISTS app_description text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS footer_note text,
  ADD COLUMN IF NOT EXISTS show_powered_by boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS powered_by_label text NOT NULL DEFAULT 'Powered by LUMATEK TECHNOLOGY';