CREATE OR REPLACE FUNCTION public.stock_balance_internal(
  _location_type text,
  _location_id uuid,
  _tank_id uuid,
  _product_id uuid,
  _until timestamptz DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE
    WHEN movement_type IN ('initial','entry','transfer_in','adjustment_in') THEN quantity
    WHEN movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN -quantity
    ELSE 0 END), 0)
  FROM public.stock_movements
  WHERE status = 'validated' AND product_id = _product_id
    AND ((_location_type = 'station' AND station_id = _location_id)
      OR (_location_type = 'depot' AND depot_id = _location_id))
    AND (_tank_id IS NULL OR tank_id = _tank_id)
    AND (_until IS NULL OR movement_date <= _until)
$$;
REVOKE ALL ON FUNCTION public.stock_balance_internal(text,uuid,uuid,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_balance_internal(text,uuid,uuid,uuid,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.initialize_tank_opening(_entry_id uuid, _tank_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  x record;
  opening numeric;
  tz text;
  mdate timestamptz;
  ref text;
BEGIN
  SELECT e.id AS entry_id, e.station_id, e.tenant_id, e.country_id, e.entry_date,
         r.stock_ouverture, r.depotage, r.sortie, r.jauge, t.product_id
    INTO x
  FROM public.index_entries e
  JOIN public.index_tank_readings r ON r.entry_id = e.id
  JOIN public.tanks t ON t.id = r.tank_id
  WHERE e.id = _entry_id AND r.tank_id = _tank_id;
  IF NOT FOUND OR x.product_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.tank_id = _tank_id AND sm.product_id = x.product_id
      AND sm.movement_type = 'initial' AND sm.status <> 'rejected'
  ) THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.index_tank_readings previous
    JOIN public.index_entries pe ON pe.id = previous.entry_id
    WHERE previous.tank_id = _tank_id AND previous.entry_date < x.entry_date
      AND pe.status = 'valide'
  ) THEN RETURN NULL; END IF;

  opening := CASE
    WHEN COALESCE(x.stock_ouverture, 0) > 0 THEN x.stock_ouverture
    ELSE GREATEST(COALESCE(x.jauge, 0) + COALESCE(x.sortie, 0) - COALESCE(x.depotage, 0), 0)
  END;
  IF opening <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO tz FROM public.countries c WHERE c.id = x.country_id;
  tz := COALESCE(tz, 'Africa/Porto-Novo');
  mdate := ((x.entry_date::timestamp + interval '20 hours') AT TIME ZONE tz) - interval '1 minute';
  ref := 'IDX-' || to_char(x.entry_date, 'YYYYMMDD') || '-' || left(x.entry_id::text, 8);

  INSERT INTO public.stock_movements(
    tenant_id, country_id, location_type, station_id, tank_id, product_id,
    movement_type, quantity, reason, reference, movement_date
  ) VALUES (
    x.tenant_id, x.country_id, 'station', x.station_id, _tank_id, x.product_id,
    'initial', opening, 'Stock d''ouverture automatique — première jauge validée', ref, mdate
  );
  RETURN opening;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_tank_opening(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_tank_opening(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stock_movement_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid, 'stock.validate') OR EXISTS (SELECT 1 FROM public.workflow_requests w WHERE w.id::text = nullif(current_setting('lumatek.workflow_exec', true),'') AND w.status = 'approved' AND w.executed_at IS NULL);
  via_index boolean := current_setting('lumatek.index_validate', true) = 'on';
  loc uuid;
  avail numeric;
  tk record;
  entry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('validated','rejected') THEN
      RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
    END IF;
    IF NOT is_validator THEN
      RAISE EXCEPTION 'Validation réservée aux utilisateurs autorisés (stock.validate)';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','validated_by','validated_at','validation_note'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','validated_by','validated_at','validation_note']) THEN
      RAISE EXCEPTION 'Seul le statut de validation peut être modifié';
    END IF;
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.status = 'validated' AND NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN
      loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
      avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);
      IF NEW.quantity > avail THEN
        RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT NULL::uuid AS station_id, NULL::uuid AS product_id, NULL::numeric AS capacity_liters INTO tk;
  NEW.requested_by := uid;
  NEW.requested_by_name := (SELECT full_name FROM public.profiles WHERE user_id = uid);
  NEW.created_at := now();
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour un ajustement ou un inventaire';
  END IF;
  IF NEW.movement_type = 'inventory' AND NEW.physical_level IS NULL THEN
    RAISE EXCEPTION 'Le niveau physique mesuré est obligatoire pour un inventaire';
  END IF;
  IF NEW.movement_type <> 'inventory' AND NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être strictement positive';
  END IF;
  IF NEW.movement_date > now() THEN
    RAISE EXCEPTION 'La date du mouvement ne peut pas être dans le futur';
  END IF;
  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id, product_id, capacity_liters INTO tk FROM public.tanks WHERE id = NEW.tank_id;
    IF NEW.location_type <> 'station' OR tk.station_id IS DISTINCT FROM NEW.station_id THEN
      RAISE EXCEPTION 'La cuve n''appartient pas à cette station';
    END IF;
    IF tk.product_id IS NOT NULL AND tk.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au produit de la cuve';
    END IF;
  END IF;

  -- La première vente ou jauge validée crée l'ouverture avant tout contrôle de disponibilité.
  IF via_index AND NEW.tank_id IS NOT NULL
     AND NEW.movement_type IN ('sale','inventory') AND NEW.reference LIKE 'IDX-%' THEN
    SELECT e.id INTO entry_id
    FROM public.index_entries e
    JOIN public.index_tank_readings r ON r.entry_id = e.id
    WHERE r.tank_id = NEW.tank_id
      AND 'IDX-' || to_char(e.entry_date, 'YYYYMMDD') || '-' || left(e.id::text, 8) = NEW.reference
    LIMIT 1;
    IF entry_id IS NOT NULL THEN
      PERFORM public.initialize_tank_opening(entry_id, NEW.tank_id);
    END IF;
  END IF;

  loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
  avail := CASE WHEN via_index
    THEN public.stock_balance_internal(NEW.location_type, loc, NEW.tank_id, NEW.product_id)
    ELSE public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id)
  END;
  IF NEW.movement_type = 'inventory' THEN
    NEW.theoretical_at_count := avail;
    NEW.quantity := 0;
  END IF;
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') THEN
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSIF NEW.movement_type = 'initial' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE movement_type = 'initial' AND status <> 'rejected'
               AND product_id = NEW.product_id AND tank_id IS NOT DISTINCT FROM NEW.tank_id
               AND station_id IS NOT DISTINCT FROM NEW.station_id AND depot_id IS NOT DISTINCT FROM NEW.depot_id) THEN
      RAISE EXCEPTION 'Un stock initial existe déjà : utilisez un ajustement';
    END IF;
    NEW.status := CASE WHEN is_validator OR via_index THEN 'validated' ELSE 'pending' END;
  ELSE
    NEW.status := 'validated';
  END IF;
  IF NEW.status = 'validated' THEN
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') AND NEW.quantity > avail THEN
      RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
    END IF;
    IF NEW.movement_type = 'initial' AND tk.capacity_liters IS NOT NULL
       AND NEW.quantity > tk.capacity_liters THEN
      RAISE EXCEPTION 'Capacité de la cuve dépassée (% L)', tk.capacity_liters;
    ELSIF NEW.movement_type IN ('entry','transfer_in','adjustment_in') AND tk.capacity_liters IS NOT NULL
       AND avail + NEW.quantity > tk.capacity_liters THEN
      RAISE EXCEPTION 'Capacité de la cuve dépassée (% L)', tk.capacity_liters;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.stock_movement_before() FROM PUBLIC, anon, authenticated;

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
    station_id, depot_id, tank_id, product_id, physical_level, movement_date AS counted_at,
    COALESCE((SELECT SUM(CASE
      WHEN h.movement_type IN ('initial','entry','transfer_in','adjustment_in') THEN h.quantity
      WHEN h.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN -h.quantity
      ELSE 0 END)
      FROM public.stock_movements h
      WHERE h.status = 'validated' AND h.product_id = stock_movements.product_id
        AND h.station_id IS NOT DISTINCT FROM stock_movements.station_id
        AND h.depot_id IS NOT DISTINCT FROM stock_movements.depot_id
        AND h.tank_id IS NOT DISTINCT FROM stock_movements.tank_id
        AND h.movement_date <= stock_movements.movement_date), 0) AS theoretical_at_count
  FROM public.stock_movements
  WHERE movement_type='inventory' AND status='validated'
  ORDER BY station_id, depot_id, tank_id, product_id, movement_date DESC, created_at DESC
)
SELECT mv.tenant_id, mv.country_id, mv.location_type, mv.station_id, mv.depot_id, mv.tank_id, mv.product_id,
  mv.initial_qty, mv.entries, mv.exits, mv.sales,
  mv.initial_qty + mv.entries - mv.exits - mv.sales AS theoretical,
  inv.physical_level AS physical, inv.counted_at,
  CASE WHEN inv.physical_level IS NULL THEN NULL::numeric ELSE inv.physical_level - inv.theoretical_at_count END AS variance,
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
GRANT SELECT ON public.stock_levels TO authenticated;

CREATE OR REPLACE FUNCTION public.reconciliation_gauge_variance(_station uuid, _date date, _product uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT SUM(CASE
    WHEN COALESCE(r.stock_ouverture, 0) = 0 AND opening.quantity IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.index_tank_readings previous
        JOIN public.index_entries pe ON pe.id = previous.entry_id
        WHERE previous.tank_id = r.tank_id AND previous.entry_date < r.entry_date AND pe.status = 'valide'
      )
    THEN r.jauge - (opening.quantity + COALESCE(r.depotage, 0) - COALESCE(r.sortie, 0))
    ELSE r.ecart END)
  FROM public.index_tank_readings r
  JOIN public.tanks t ON t.id = r.tank_id
  LEFT JOIN LATERAL (
    SELECT sm.quantity FROM public.stock_movements sm
    WHERE sm.tank_id = r.tank_id AND sm.product_id = t.product_id
      AND sm.movement_type = 'initial' AND sm.status = 'validated'
    ORDER BY sm.movement_date, sm.created_at LIMIT 1
  ) opening ON true
  WHERE r.station_id = _station AND r.entry_date = _date
    AND t.product_id = _product AND r.jauge IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.reconciliation_gauge_variance(uuid,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliation_gauge_variance(uuid,date,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_station_day(_station uuid, _date date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); st record; cl record; rec record; tol public.reconciliation_tolerances;
  lines jsonb := '[]'::jsonb; pay jsonb; worst int := 0; rk int; res text;
  p record; v_idx numeric; v_sales numeric; a_sales numeric; v_tank numeric; v_adj numeric; v_gauge numeric; v_legacy numeric;
  pct numeric; amt numeric; lres text; unit numeric;
  tot_vol numeric := 0; tot_amt numeric := 0; tot_coll numeric := 0; tot_vvar numeric := 0;
  c_fuel numeric; fc_tx numeric; fc_l numeric; fc_n int; fres text; c_credit numeric; c_cash numeric; pres text; rid uuid; uname text;
BEGIN
  SELECT * INTO st FROM stations WHERE id = _station;
  IF st IS NULL OR NOT can_access_tenant_country(uid, st.tenant_id, st.country_id) THEN RAISE EXCEPTION 'Station inaccessible'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid,'reconciliation.create') OR has_permission(uid,'reconciliation.validate')) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF NOT is_module_enabled(st.tenant_id, st.country_id, 'ventes') THEN RAISE EXCEPTION 'Module Ventes désactivé'; END IF;
  SELECT * INTO rec FROM reconciliations WHERE station_id = _station AND recon_date = _date;
  IF rec.id IS NOT NULL AND rec.workflow = 'validated' THEN RAISE EXCEPTION 'Réconciliation validée : rouvrez-la avant de recalculer'; END IF;
  SELECT * INTO cl FROM daily_closures WHERE station_id = _station AND closure_date = _date AND status <> 'rejected' ORDER BY created_at DESC LIMIT 1;

  FOR p IN SELECT DISTINCT pr.id, pr.name, pr.code FROM petroleum_products pr
     WHERE pr.id IN (SELECT product_id FROM tanks WHERE station_id = _station AND product_id IS NOT NULL
                     UNION SELECT product_id FROM closure_sales WHERE closure_id = cl.id) LOOP
    SELECT * INTO tol FROM reconciliation_tolerances WHERE tenant_id = st.tenant_id AND country_id = st.country_id AND product_id = p.id;
    IF tol.id IS NULL THEN SELECT * INTO tol FROM reconciliation_tolerances WHERE tenant_id = st.tenant_id AND country_id = st.country_id AND product_id IS NULL; END IF;
    IF tol.id IS NULL THEN tol.vol_watch_pct := 0.3; tol.vol_anomaly_pct := 0.5; tol.vol_critical_pct := 1.0; tol.amt_watch := 5000; tol.amt_anomaly := 20000; tol.amt_critical := 100000; END IF;

    SELECT coalesce(sum(volume) FILTER (WHERE volume_mode = 'index'),0), coalesce(sum(volume),0), coalesce(sum(amount),0)
      INTO v_idx, v_sales, a_sales FROM closure_sales WHERE closure_id = cl.id AND product_id = p.id;
    SELECT coalesce(sum(quantity) FILTER (WHERE movement_type = 'sale'),0)
             - coalesce(sum(quantity) FILTER (WHERE movement_type = 'adjustment_in' AND reference IN (
                 SELECT s2.reference FROM stock_movements s2 WHERE s2.station_id = _station AND s2.product_id = p.id
                   AND s2.movement_type = 'sale' AND s2.status = 'validated' AND s2.reference IS NOT NULL)),0),
           coalesce(sum(quantity) FILTER (WHERE movement_type = 'adjustment_in'),0) - coalesce(sum(quantity) FILTER (WHERE movement_type = 'adjustment_out'),0),
           NULL::numeric
      INTO v_tank, v_adj, v_gauge FROM stock_movements
      WHERE station_id = _station AND product_id = p.id AND status = 'validated' AND location_type = 'station'
        AND (movement_date AT TIME ZONE 'UTC')::date = _date;
    -- La première jauge sans ouverture saisie utilise le stock initial automatique.
    v_gauge := public.reconciliation_gauge_variance(_station, _date, p.id);
    SELECT CASE WHEN lower(coalesce(p.code,'')||p.name) LIKE '%gas%' OR lower(coalesce(p.code,'')||p.name) LIKE '%diesel%'
                THEN sum(greatest(total_gasoil_liters,0)) ELSE sum(greatest(total_super_liters,0)) END
      INTO v_legacy FROM index_entries WHERE station_id = _station AND entry_date = _date;
    unit := CASE WHEN v_sales > 0 THEN a_sales / v_sales ELSE 0 END;
    pct := 0; amt := 0;
    IF v_sales > 0 THEN
      IF cl.status = 'validated' THEN pct := round((v_tank - v_sales) / v_sales * 100, 3); END IF;
      IF v_gauge IS NOT NULL THEN pct := CASE WHEN abs(v_gauge / v_sales * 100) > abs(pct) THEN round(v_gauge / v_sales * 100, 3) ELSE pct END; END IF;
      IF v_legacy IS NOT NULL AND v_legacy > 0 THEN pct := CASE WHEN abs((v_legacy - v_sales) / v_sales * 100) > abs(pct) THEN round((v_legacy - v_sales) / v_sales * 100, 3) ELSE pct END; END IF;
      amt := round(pct / 100 * v_sales * unit);
    ELSIF v_tank > 0 THEN pct := 100; amt := round(v_tank * unit);
    END IF;
    lres := recon_classify(pct, amt, tol);
    rk := CASE lres WHEN 'critique' THEN 3 WHEN 'anomalie' THEN 2 WHEN 'surveiller' THEN 1 ELSE 0 END;
    worst := greatest(worst, rk);
    tot_vol := tot_vol + v_sales; tot_amt := tot_amt + a_sales; tot_vvar := tot_vvar + round(pct / 100 * greatest(v_sales, v_tank), 2);
    lines := lines || jsonb_build_object('product_id', p.id, 'product', p.name, 'index_volume', v_idx, 'sales_volume', v_sales, 'sales_amount', a_sales,
      'tank_out', v_tank, 'adjustments', v_adj, 'gauge_variance', v_gauge, 'legacy_index_volume', v_legacy, 'unit_price', round(unit,2),
      'variance_pct', pct, 'variance_amount', amt, 'result', lres,
      'tolerance', jsonb_build_object('watch', tol.vol_watch_pct, 'anomaly', tol.vol_anomaly_pct, 'critical', tol.vol_critical_pct));
  END LOOP;

  SELECT coalesce(sum(cp.amount),0), coalesce(sum(cp.amount) FILTER (WHERE pm.kind = 'fuel_card'),0),
         coalesce(sum(cp.amount) FILTER (WHERE pm.kind = 'credit'),0), coalesce(sum(cp.amount) FILTER (WHERE pm.kind = 'cash'),0),
         coalesce(jsonb_agg(jsonb_build_object('method', pm.label, 'kind', pm.kind, 'amount', cp.amount)) FILTER (WHERE cp.id IS NOT NULL), '[]'::jsonb)
    INTO tot_coll, c_fuel, c_credit, c_cash, pay
    FROM closure_payments cp JOIN payment_methods pm ON pm.id = cp.payment_method_id WHERE cp.closure_id = cl.id;
  SELECT * INTO tol FROM reconciliation_tolerances WHERE tenant_id = st.tenant_id AND country_id = st.country_id AND product_id IS NULL;
  IF tol.id IS NULL THEN tol.vol_watch_pct := 0.3; tol.vol_anomaly_pct := 0.5; tol.vol_critical_pct := 1.0; tol.amt_watch := 5000; tol.amt_anomaly := 20000; tol.amt_critical := 100000; END IF;
  SELECT coalesce(sum(t.amount),0), coalesce(sum(t.litres),0), count(*) INTO fc_tx, fc_l, fc_n
    FROM fuel_card_transactions t JOIN countries co ON co.id = st.country_id
    WHERE t.station_id = _station AND t.kind = 'purchase' AND (t.occurred_at AT TIME ZONE coalesce(co.timezone,'Africa/Porto-Novo'))::date = _date;
  fres := recon_classify(0, c_fuel - fc_tx, tol);
  worst := greatest(worst, CASE fres WHEN 'critique' THEN 3 WHEN 'anomalie' THEN 2 WHEN 'surveiller' THEN 1 ELSE 0 END);
  pres := recon_classify(0, tot_coll - tot_amt, tol);
  worst := greatest(worst, CASE pres WHEN 'critique' THEN 3 WHEN 'anomalie' THEN 2 WHEN 'surveiller' THEN 1 ELSE 0 END);
  IF cl.id IS NULL THEN worst := greatest(worst, 1); END IF;
  res := (ARRAY['conforme','surveiller','anomalie','critique'])[worst + 1];

  INSERT INTO reconciliations AS r (tenant_id, country_id, station_id, recon_date, closure_id, result, sales_volume, sales_amount, collected_amount, volume_variance, value_variance, details, computed_at, computed_by)
  VALUES (st.tenant_id, st.country_id, _station, _date, cl.id, res, tot_vol, tot_amt, tot_coll, tot_vvar, tot_coll - tot_amt,
    jsonb_build_object('closure_status', cl.status, 'products', lines, 'payments', pay, 'payment_result', pres,
      'fuel_cards', c_fuel, 'fuel_card_transactions', fc_tx, 'fuel_card_litres', fc_l, 'fuel_card_count', fc_n, 'fuel_card_variance', c_fuel - fc_tx, 'fuel_card_result', fres, 'b2b_credit', c_credit, 'cash', c_cash), now(), uid)
  ON CONFLICT (station_id, recon_date) DO UPDATE SET closure_id = EXCLUDED.closure_id, result = EXCLUDED.result, sales_volume = EXCLUDED.sales_volume,
    sales_amount = EXCLUDED.sales_amount, collected_amount = EXCLUDED.collected_amount, volume_variance = EXCLUDED.volume_variance,
    value_variance = EXCLUDED.value_variance, details = EXCLUDED.details, computed_at = now(), computed_by = uid, updated_at = now()
  RETURNING id INTO rid;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  INSERT INTO reconciliation_events (reconciliation_id, tenant_id, country_id, action, from_workflow, to_workflow, result, data, author_id, author_name)
  VALUES (rid, st.tenant_id, st.country_id, 'compute', rec.workflow, coalesce(rec.workflow,'open'), res,
    jsonb_build_object('sales_volume', tot_vol, 'value_variance', tot_coll - tot_amt, 'volume_variance', tot_vvar), uid, uname);
  RETURN rid;
END $$;