ALTER TABLE public.tenant_countries
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS bank_details text;

COMMENT ON COLUMN public.tenant_countries.legal_name IS 'Raison sociale de l''entité du pays (remplace celle de la société sur les documents)';

CREATE OR REPLACE FUNCTION public.set_country_identity(_tenant uuid, _country uuid, _data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid(); d jsonb := COALESCE(_data, '{}'::jsonb);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF NOT public.can_access_tenant_country(uid, _tenant, _country) THEN RAISE EXCEPTION 'Pays non autorisé'; END IF;
  IF NOT (public.is_platform_admin(uid) OR public.has_role(uid, 'admin') OR public.has_permission(uid, 'settings.administer')) THEN
    RAISE EXCEPTION 'Droit « Administrer — Paramètres société » requis';
  END IF;
  IF length(COALESCE(d->>'legal_name','')) > 200 OR length(COALESCE(d->>'address','')) > 300
     OR length(COALESCE(d->>'phone','')) > 100 OR length(COALESCE(d->>'email','')) > 200
     OR length(COALESCE(d->>'tax_id','')) > 100 OR length(COALESCE(d->>'bank_details','')) > 400 THEN
    RAISE EXCEPTION 'Valeur trop longue';
  END IF;
  UPDATE public.tenant_countries SET
    legal_name   = NULLIF(btrim(d->>'legal_name'), ''),
    address      = NULLIF(btrim(d->>'address'), ''),
    phone        = NULLIF(btrim(d->>'phone'), ''),
    email        = NULLIF(btrim(d->>'email'), ''),
    tax_id       = NULLIF(btrim(d->>'tax_id'), ''),
    bank_details = NULLIF(btrim(d->>'bank_details'), '')
  WHERE tenant_id = _tenant AND country_id = _country;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pays non rattaché à cette société'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.set_country_identity(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_country_identity(uuid, uuid, jsonb) TO authenticated;