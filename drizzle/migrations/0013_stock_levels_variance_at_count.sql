CREATE OR REPLACE VIEW public.stock_levels WITH (security_invoker = true) AS
WITH mv AS (
  SELECT tenant_id, country_id, location_type, station_id, depot_id, tank_id, product_id,
    SUM(CASE WHEN movement_type='initial' THEN quantity ELSE 0 END) AS initial_qty,
    SUM(CASE WHEN movement_type IN ('entry','transfer_in','adjustment_in') THEN quantity ELSE 0 END) AS entries,
    SUM(CASE WHEN movement_type IN ('exit','transfer_out','adjustment_out') THEN quantity ELSE 0 END) AS exits,
    SUM(CASE WHEN movement_type='sale' THEN quantity ELSE 0 END) AS sales
  FROM public.stock_movements WHERE status = 'validated'
  GROUP BY 1,2,3,4,5,6,7
), inv AS (
  SELECT DISTINCT ON (station_id, depot_id, tank_id, product_id)
    station_id, depot_id, tank_id, product_id, physical_level, theoretical_at_count, movement_date AS counted_at
  FROM public.stock_movements WHERE movement_type='inventory' AND status='validated'
  ORDER BY station_id, depot_id, tank_id, product_id, movement_date DESC
)
SELECT mv.*,
  mv.initial_qty + mv.entries - mv.exits - mv.sales AS theoretical,
  inv.physical_level AS physical, inv.counted_at,
  CASE WHEN inv.physical_level IS NULL THEN NULL ELSE inv.physical_level - inv.theoretical_at_count END AS variance,
  COALESCE(t.capacity_liters, d.capacity_liters) AS capacity,
  COALESCE(t.min_threshold, d.min_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.25) AS min_threshold,
  COALESCE(t.critical_threshold, d.critical_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.10) AS critical_threshold,
  CASE
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= 0 THEN 'rupture'
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= COALESCE(t.critical_threshold, d.critical_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.10, 0) THEN 'critique'
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= COALESCE(t.min_threshold, d.min_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.25, 0) THEN 'faible'
    ELSE 'normal' END AS alert_level
FROM mv
LEFT JOIN inv ON inv.station_id IS NOT DISTINCT FROM mv.station_id AND inv.depot_id IS NOT DISTINCT FROM mv.depot_id
  AND inv.tank_id IS NOT DISTINCT FROM mv.tank_id AND inv.product_id = mv.product_id
LEFT JOIN public.tanks t ON t.id = mv.tank_id
LEFT JOIN public.depot_product_thresholds d ON d.depot_id = mv.depot_id AND d.product_id = mv.product_id;