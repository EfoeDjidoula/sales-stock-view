CREATE OR REPLACE FUNCTION public.reconcile_station_day(_station uuid, _date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); st record; cl record; rec record; tol public.reconciliation_tolerances;
  lines jsonb := '[]'::jsonb; pay jsonb; worst int := 0; rk int; res text;
  p record; v_idx numeric; v_sales numeric; a_sales numeric; v_tank numeric; v_adj numeric; v_gauge numeric; v_legacy numeric;
  pct numeric; amt numeric; lres text; unit numeric;
  tot_vol numeric := 0; tot_amt numeric := 0; tot_coll numeric := 0; tot_vvar numeric := 0;
  c_fuel numeric; c_credit numeric; c_cash numeric; pres text; rid uuid; uname text;
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
    SELECT coalesce(sum(quantity) FILTER (WHERE movement_type = 'sale'),0),
           coalesce(sum(quantity) FILTER (WHERE movement_type = 'adjustment_in'),0) - coalesce(sum(quantity) FILTER (WHERE movement_type = 'adjustment_out'),0),
           sum(physical_level - theoretical_at_count) FILTER (WHERE movement_type = 'inventory')
      INTO v_tank, v_adj, v_gauge FROM stock_movements
      WHERE station_id = _station AND product_id = p.id AND status = 'validated' AND location_type = 'station'
        AND (movement_date AT TIME ZONE 'UTC')::date = _date;
    SELECT CASE WHEN lower(coalesce(p.code,'')||p.name) LIKE '%gas%' OR lower(coalesce(p.code,'')||p.name) LIKE '%diesel%'
                THEN sum(greatest(total_gasoil_liters,0)) ELSE sum(greatest(total_super_liters,0)) END
      INTO v_legacy FROM index_entries WHERE station_id = _station AND entry_date = _date;
    unit := CASE WHEN v_sales > 0 THEN a_sales / v_sales ELSE 0 END;
    pct := 0; amt := 0;
    IF v_sales > 0 THEN
      IF cl.status = 'validated' THEN
        pct := round((v_tank - v_sales) / v_sales * 100, 3);
      END IF;
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
  pres := recon_classify(0, tot_coll - tot_amt, tol);
  worst := greatest(worst, CASE pres WHEN 'critique' THEN 3 WHEN 'anomalie' THEN 2 WHEN 'surveiller' THEN 1 ELSE 0 END);
  IF cl.id IS NULL THEN worst := greatest(worst, 1); END IF;
  res := (ARRAY['conforme','surveiller','anomalie','critique'])[worst + 1];

  INSERT INTO reconciliations AS r (tenant_id, country_id, station_id, recon_date, closure_id, result, sales_volume, sales_amount, collected_amount, volume_variance, value_variance, details, computed_at, computed_by)
  VALUES (st.tenant_id, st.country_id, _station, _date, cl.id, res, tot_vol, tot_amt, tot_coll, tot_vvar, tot_coll - tot_amt,
    jsonb_build_object('closure_status', cl.status, 'products', lines, 'payments', pay, 'payment_result', pres,
      'fuel_cards', c_fuel, 'b2b_credit', c_credit, 'cash', c_cash), now(), uid)
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