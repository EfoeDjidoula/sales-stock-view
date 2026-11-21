UPDATE public.price_structures p
   SET country = c.iso_code
  FROM public.countries c
 WHERE c.id = p.country_id
   AND p.country IS DISTINCT FROM c.iso_code;

ALTER TABLE public.price_structures DROP CONSTRAINT IF EXISTS price_structures_country_effective_date_key;
ALTER TABLE public.price_structures
  ADD CONSTRAINT price_structures_tenant_country_effective_date_key UNIQUE (tenant_id, country_id, effective_date);

COMMENT ON COLUMN public.price_structures.country IS 'Code ISO du pays (dérivé de country_id) ; l''unicité porte sur tenant_id + country_id + effective_date';