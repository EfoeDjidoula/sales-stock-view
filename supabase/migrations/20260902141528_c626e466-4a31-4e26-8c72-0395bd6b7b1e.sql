CREATE OR REPLACE FUNCTION public.set_tenant_country_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _country uuid;
BEGIN
  SELECT p.tenant_id, p.country_id INTO _tenant, _country
  FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := _tenant;
  END IF;
  IF NEW.country_id IS NULL THEN
    NEW.country_id := _country;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','depotages','fiscal_years','index_entries','orders',
    'perequation_entries','perequation_rates','perequation_zones',
    'price_structures','pump_index_entries','pumps','stations',
    'suppliers','supplies','tanks','trucks'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN country_id DROP DEFAULT', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP NOT NULL', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant_country ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_tenant_country BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_country_context()',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.set_tenant_country_context() FROM PUBLIC, anon;