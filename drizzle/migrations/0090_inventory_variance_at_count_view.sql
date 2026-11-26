CREATE VIEW public.stock_inventory_variances WITH (security_invoker = true) AS
SELECT
  sm.id, sm.tenant_id, sm.country_id, sm.location_type, sm.station_id, sm.depot_id,
  sm.tank_id, sm.product_id, sm.movement_type, sm.quantity, sm.physical_level,
  COALESCE((SELECT SUM(CASE
    WHEN h.movement_type IN ('initial','entry','transfer_in','adjustment_in') THEN h.quantity
    WHEN h.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN -h.quantity
    ELSE 0 END)
    FROM public.stock_movements h
    WHERE h.status = 'validated' AND h.product_id = sm.product_id
      AND h.station_id IS NOT DISTINCT FROM sm.station_id
      AND h.depot_id IS NOT DISTINCT FROM sm.depot_id
      AND h.tank_id IS NOT DISTINCT FROM sm.tank_id
      AND h.movement_date <= sm.movement_date), 0) AS theoretical_at_count,
  sm.reason, sm.reference, sm.transfer_id, sm.status, sm.movement_date,
  sm.requested_by, sm.requested_by_name, sm.validated_by, sm.validated_at,
  sm.validation_note, sm.created_at
FROM public.stock_movements sm
WHERE sm.movement_type = 'inventory';
GRANT SELECT ON public.stock_inventory_variances TO authenticated;
GRANT ALL ON public.stock_inventory_variances TO service_role;