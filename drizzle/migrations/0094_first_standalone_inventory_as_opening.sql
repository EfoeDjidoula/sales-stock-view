CREATE OR REPLACE VIEW public.stock_inventory_variances WITH (security_invoker = true) AS
WITH inventory AS (
  SELECT sm.*, COALESCE((SELECT SUM(CASE
    WHEN h.movement_type IN ('initial','entry','transfer_in','adjustment_in') THEN h.quantity
    WHEN h.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN -h.quantity
    ELSE 0 END)
    FROM public.stock_movements h
    WHERE h.status = 'validated' AND h.product_id = sm.product_id
      AND h.station_id IS NOT DISTINCT FROM sm.station_id
      AND h.depot_id IS NOT DISTINCT FROM sm.depot_id
      AND h.tank_id IS NOT DISTINCT FROM sm.tank_id
      AND h.movement_date <= sm.movement_date), 0) AS ledger_at_count
  FROM public.stock_movements sm
  WHERE sm.movement_type = 'inventory'
), resolved AS (
  SELECT i.id, i.tenant_id, i.country_id, i.location_type, i.station_id, i.depot_id,
    i.tank_id, i.product_id, i.movement_type, i.quantity, i.physical_level,
    CASE
      WHEN r.id IS NOT NULL THEN i.physical_level - (
        r.jauge - (
          CASE
            WHEN COALESCE(r.stock_ouverture, 0) > 0 THEN r.stock_ouverture
            WHEN NOT EXISTS (
              SELECT 1 FROM public.index_tank_readings previous
              JOIN public.index_entries pe ON pe.id = previous.entry_id
              WHERE previous.tank_id = r.tank_id AND previous.entry_date < r.entry_date AND pe.status = 'valide'
            ) THEN COALESCE(opening.quantity, 0)
            ELSE COALESCE(r.stock_ouverture, 0)
          END + COALESCE(r.depotage, 0) - COALESCE(r.sortie, 0)
        )
      )
      WHEN NOT EXISTS (
        SELECT 1 FROM public.stock_movements previous_inventory
        WHERE previous_inventory.tank_id = i.tank_id AND previous_inventory.product_id = i.product_id
          AND previous_inventory.movement_type = 'inventory' AND previous_inventory.status = 'validated'
          AND previous_inventory.movement_date < i.movement_date
      ) AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements previous_movement
        WHERE previous_movement.tank_id = i.tank_id AND previous_movement.product_id = i.product_id
          AND previous_movement.movement_type <> 'inventory' AND previous_movement.status = 'validated'
          AND previous_movement.movement_date <= i.movement_date
      ) THEN i.physical_level
      ELSE i.ledger_at_count
    END AS theoretical_at_count,
    i.reason, i.reference, i.transfer_id, i.status, i.movement_date,
    i.requested_by, i.requested_by_name, i.validated_by, i.validated_at,
    i.validation_note, i.created_at
  FROM inventory i
  LEFT JOIN public.index_entries e
    ON 'IDX-' || to_char(e.entry_date, 'YYYYMMDD') || '-' || left(e.id::text, 8) = i.reference
  LEFT JOIN public.index_tank_readings r ON r.entry_id = e.id AND r.tank_id = i.tank_id
  LEFT JOIN LATERAL (
    SELECT sm.quantity FROM public.stock_movements sm
    WHERE sm.tank_id = i.tank_id AND sm.product_id = i.product_id
      AND sm.movement_type = 'initial' AND sm.status = 'validated'
    ORDER BY sm.movement_date, sm.created_at LIMIT 1
  ) opening ON true
)
SELECT * FROM resolved;
GRANT SELECT ON public.stock_inventory_variances TO authenticated;
GRANT ALL ON public.stock_inventory_variances TO service_role;