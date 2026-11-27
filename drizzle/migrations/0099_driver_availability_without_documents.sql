CREATE OR REPLACE FUNCTION public.logistics_driver_availability(_tenant uuid, _country uuid)
RETURNS TABLE(driver_id uuid, full_name text, available boolean, reasons text[])
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT x.id, x.full_name, cardinality(r.reasons) = 0, r.reasons
  FROM public.logistics_drivers x
  CROSS JOIN LATERAL (SELECT array_remove(ARRAY[
    CASE WHEN x.status <> 'active' THEN 'Statut : ' || x.status END,
    (SELECT 'Opération en cours : ' || string_agg(COALESCE(b.number || ' / ', '') || COALESCE(t.reference, '?'), ', ')
       FROM public.logistics_trips t LEFT JOIN public.depot_lifting_orders b ON b.trip_id = t.id
      WHERE t.driver_id = x.id AND t.status NOT IN ('delivered','cancelled'))
  ]::text[], NULL) AS reasons) r
  WHERE x.tenant_id = _tenant AND x.country_id = _country
$$;