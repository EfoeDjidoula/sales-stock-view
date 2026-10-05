CREATE OR REPLACE FUNCTION public.fraud_rule_defaults()
 RETURNS TABLE(rule_code text, label text, description text, threshold numeric, window_days integer, severity text, is_enabled boolean, unit text)
 LANGUAGE sql
 IMMUTABLE
AS $function$ VALUES
 ('index_modification','Modification inhabituelle d''index','Nombre de modifications/suppressions d''index (saisie index, lignes de clôture) le même jour pour une station ≥ seuil.',2::numeric,1,'haute',true,'modifications'),
 ('retroactive_adjustment','Ajustement rétroactif','Ajustement / stock initial / inventaire saisi plus de N jours après la date du mouvement.',2,1,'haute',true,'jours de retard'),
 ('abnormal_stock_drop','Baisse anormale de stock','Écart d''inventaire négatif ou sortie par ajustement dépassant le seuil en % du stock théorique / de la capacité.',2,1,'critique',true,'%'),
 ('repeated_variances','Écarts répétés','Nombre de réconciliations en Anomalie ou Critique sur la fenêtre ≥ seuil.',3,7,'haute',true,'écarts'),
 ('cancelled_sales','Ventes annulées inhabituelles','Nombre de clôtures rejetées ou rouvertes + lignes de vente supprimées sur la fenêtre ≥ seuil.',2,7,'moyenne',true,'annulations'),
 ('off_hours','Opération hors horaires','Mouvement de stock ou action de clôture enregistré entre 22 h et 5 h (heure du pays). Seuil = nombre minimum d''opérations.',1,1,'moyenne',true,'opérations'),
 ('unusual_price','Remise / prix inhabituel','Prix unitaire d''une vente s''écartant de plus de N % du prix médian du produit sur la fenêtre.',5,30,'haute',true,'%'),
 ('repetitive_transactions','Transactions répétitives','Même station, même type et même quantité de mouvement (ou même montant d''encaissement) répétés le même jour ≥ seuil.',3,1,'moyenne',true,'répétitions'),
 ('sales_collection_mismatch','Incohérence ventes / encaissements','Écart entre ventes et encaissements d''une clôture supérieur à N % du montant des ventes.',1,1,'haute',true,'%'),
 ('fuel_card','Fuel Cards ≠ encaissements','Écart entre les transactions Fuel Cards d''une station et les encaissements « fuel card » déclarés dans ses clôtures du jour supérieur au seuil (FCFA).',1000,1,'haute',true,'FCFA'),
 ('fuel_card_over_limit','Fuel Card hors plafond','Transaction dépassant le plafond par transaction, en litres ou le cumul jour/semaine/mois de la carte, ou montant ≥ seuil de surveillance (0 = désactivé).',0,1,'haute',true,'FCFA'),
 ('fuel_card_off_hours','Fuel Card hors horaires','Transaction hors de la plage horaire de la carte (heure du pays), ou entre 22 h et 5 h si aucune plage n''est définie.',1,1,'moyenne',true,'transactions'),
 ('fuel_card_restriction','Fuel Card hors restrictions','Transaction sur un produit, une station ou un véhicule non autorisé par la carte (selon ses restrictions actuelles).',1,1,'critique',true,'transactions')
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_station_day(_station uuid, _date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.run_fraud_scan(_tenant uuid, _country uuid, _from date, _to date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); r record; cfg record; tz text; n int := 0; c int; sevp int;
BEGIN
  IF NOT can_access_tenant_country(uid, _tenant, _country) THEN RAISE EXCEPTION 'Périmètre inaccessible'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid,'fraud.create') OR has_permission(uid,'fraud.validate')) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF NOT is_module_enabled(_tenant, _country, 'anti_fraude') THEN RAISE EXCEPTION 'Module Anti-fraude désactivé'; END IF;
  IF _to < _from OR _to - _from > 92 THEN RAISE EXCEPTION 'Période invalide (92 jours max)'; END IF;
  SELECT coalesce(timezone,'Africa/Porto-Novo') INTO tz FROM countries WHERE id = _country;

  CREATE TEMP TABLE IF NOT EXISTS _fa (station_id uuid, rule_code text, alert_date date, title text, explanation text, evidence jsonb, fp text) ON COMMIT DROP;
  TRUNCATE _fa;

  FOR cfg IN SELECT d.rule_code, d.label, coalesce(fr.is_enabled, d.is_enabled) en, coalesce(fr.threshold, d.threshold) th,
                    coalesce(fr.window_days, d.window_days) wd, coalesce(fr.severity, d.severity) sev
             FROM fraud_rule_defaults() d
             LEFT JOIN fraud_rules fr ON fr.tenant_id=_tenant AND fr.country_id=_country AND fr.rule_code=d.rule_code LOOP
    CONTINUE WHEN NOT cfg.en;

    IF cfg.rule_code = 'index_modification' THEN
      INSERT INTO _fa SELECT x.sid, cfg.rule_code, x.d, cfg.label,
        format('%s modification(s)/suppression(s) d''index le %s (seuil : %s). Règle : modifications d''index le même jour ≥ seuil.', x.cnt, to_char(x.d,'DD/MM/YYYY'), cfg.th),
        jsonb_build_object('count',x.cnt,'threshold',cfg.th,'users',x.users,'entities',x.ents), 'idx:'||x.sid||':'||x.d
      FROM (SELECT coalesce(ie.station_id, pie.station_id, dc.station_id) sid, (a.created_at AT TIME ZONE tz)::date d, count(*) cnt,
                   array_agg(DISTINCT a.user_name) users, array_agg(DISTINCT a.entity_type) ents
            FROM audit_logs a
            LEFT JOIN index_entries ie ON a.entity_type='index_entries' AND ie.id::text=a.entity_id
            LEFT JOIN pump_index_entries pie ON a.entity_type='pump_index_entries' AND pie.id::text=a.entity_id
            LEFT JOIN closure_sales cs ON a.entity_type='closure_sales' AND cs.id::text=a.entity_id
            LEFT JOIN daily_closures dc ON dc.id = coalesce(cs.closure_id, (a.old_value->>'closure_id')::uuid)
            WHERE a.tenant_id=_tenant AND a.country_id=_country AND a.action IN ('update','delete')
              AND a.entity_type IN ('index_entries','pump_index_entries','closure_sales')
              AND (a.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
            GROUP BY 1,2) x
      WHERE x.sid IS NOT NULL AND x.cnt >= greatest(cfg.th,1);

    ELSIF cfg.rule_code = 'retroactive_adjustment' THEN
      INSERT INTO _fa SELECT m.station_id, cfg.rule_code, (m.created_at AT TIME ZONE tz)::date, cfg.label,
        format('Mouvement « %s » de %s L daté du %s mais saisi le %s (%s jours de retard, seuil : %s). Motif : %s.', m.movement_type, m.quantity,
               to_char((m.movement_date AT TIME ZONE tz)::date,'DD/MM/YYYY'), to_char((m.created_at AT TIME ZONE tz)::date,'DD/MM/YYYY'),
               (m.created_at AT TIME ZONE tz)::date - (m.movement_date AT TIME ZONE tz)::date, cfg.th, coalesce(m.reason,'—')),
        jsonb_build_object('movement_id',m.id,'type',m.movement_type,'quantity',m.quantity,'by',m.requested_by_name), 'retro:'||m.id
      FROM stock_movements m
      WHERE m.tenant_id=_tenant AND m.country_id=_country AND m.station_id IS NOT NULL
        AND m.movement_type IN ('adjustment_in','adjustment_out','initial','inventory')
        AND (m.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to
        AND (m.created_at AT TIME ZONE tz)::date - (m.movement_date AT TIME ZONE tz)::date > cfg.th;

    ELSIF cfg.rule_code = 'abnormal_stock_drop' THEN
      INSERT INTO _fa SELECT m.station_id, cfg.rule_code, (m.movement_date AT TIME ZONE tz)::date, cfg.label,
        CASE WHEN m.movement_type='inventory' THEN
          format('Inventaire cuve %s : mesuré %s L pour %s L théoriques, soit %s %% (seuil : -%s %%).', coalesce(t.name,'?'), m.physical_level, m.theoretical_at_count,
                 round((m.physical_level - m.theoretical_at_count)/nullif(m.theoretical_at_count,0)*100,2), cfg.th)
        ELSE format('Sortie par ajustement de %s L sur la cuve %s (capacité %s L), soit %s %% de la capacité (seuil : %s %%). Motif : %s.', m.quantity, coalesce(t.name,'?'),
                 t.capacity_liters, round(m.quantity/nullif(t.capacity_liters,0)*100,2), cfg.th, coalesce(m.reason,'—')) END,
        jsonb_build_object('movement_id',m.id,'type',m.movement_type,'quantity',m.quantity,'tank',t.name), 'drop:'||m.id
      FROM stock_movements m LEFT JOIN tanks t ON t.id=m.tank_id
      WHERE m.tenant_id=_tenant AND m.country_id=_country AND m.station_id IS NOT NULL AND m.status <> 'rejected'
        AND (m.movement_date AT TIME ZONE tz)::date BETWEEN _from AND _to
        AND ((m.movement_type='inventory' AND m.theoretical_at_count > 0 AND (m.physical_level - m.theoretical_at_count)/m.theoretical_at_count*100 < -cfg.th)
          OR (m.movement_type='adjustment_out' AND t.capacity_liters > 0 AND m.quantity/t.capacity_liters*100 > cfg.th));

    ELSIF cfg.rule_code = 'repeated_variances' THEN
      INSERT INTO _fa SELECT x.station_id, cfg.rule_code, x.d, cfg.label,
        format('%s réconciliation(s) en Anomalie/Critique sur les %s jours précédant le %s (seuil : %s). Dates : %s.', x.cnt, cfg.wd, to_char(x.d,'DD/MM/YYYY'), cfg.th, x.dates),
        jsonb_build_object('count',x.cnt,'window_days',cfg.wd), 'rep:'||x.station_id||':'||x.d
      FROM (SELECT r1.station_id, r1.recon_date d,
              (SELECT count(*) FROM reconciliations r2 WHERE r2.station_id=r1.station_id AND r2.result IN ('anomalie','critique') AND r2.recon_date BETWEEN r1.recon_date - (cfg.wd-1) AND r1.recon_date) cnt,
              (SELECT string_agg(to_char(r2.recon_date,'DD/MM'),', ' ORDER BY r2.recon_date) FROM reconciliations r2 WHERE r2.station_id=r1.station_id AND r2.result IN ('anomalie','critique') AND r2.recon_date BETWEEN r1.recon_date - (cfg.wd-1) AND r1.recon_date) dates
            FROM reconciliations r1 WHERE r1.tenant_id=_tenant AND r1.country_id=_country AND r1.recon_date BETWEEN _from AND _to AND r1.result IN ('anomalie','critique')) x
      WHERE x.cnt >= greatest(cfg.th,1);

    ELSIF cfg.rule_code = 'cancelled_sales' THEN
      INSERT INTO _fa SELECT x.sid, cfg.rule_code, _to, cfg.label,
        format('%s annulation(s) sur la période (clôtures rejetées : %s, rouvertes : %s, lignes de vente supprimées : %s) — seuil : %s.', x.tot, x.rej, x.reo, x.del, cfg.th),
        jsonb_build_object('rejected',x.rej,'reopened',x.reo,'deleted_lines',x.del), 'cancel:'||x.sid||':'||_from||':'||_to
      FROM (SELECT s.id sid,
              (SELECT count(*) FROM daily_closures d WHERE d.station_id=s.id AND d.rejected_at IS NOT NULL AND (d.rejected_at AT TIME ZONE tz)::date BETWEEN _from AND _to) rej,
              (SELECT count(*) FROM audit_logs a JOIN daily_closures d ON d.id::text=a.entity_id WHERE a.entity_type='daily_closures' AND a.action='status:draft' AND d.station_id=s.id AND (a.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to)
              + (SELECT count(*) FROM daily_closures d WHERE d.station_id=s.id AND d.reopened_at IS NOT NULL AND (d.reopened_at AT TIME ZONE tz)::date BETWEEN _from AND _to AND NOT EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id=d.id::text AND a.action='status:draft')) reo,
              (SELECT count(*) FROM audit_logs a JOIN daily_closures d ON d.id = (a.old_value->>'closure_id')::uuid WHERE a.entity_type='closure_sales' AND a.action='delete' AND d.station_id=s.id AND (a.created_at AT TIME ZONE tz)::date BETWEEN _from AND _to) del,
              0 tot
            FROM stations s WHERE s.tenant_id=_tenant AND s.country_id=_country) y
      CROSS JOIN LATERAL (SELECT y.sid, y.rej, y.reo, y.del, y.rej+y.reo+y.del tot) x
      WHERE x.tot >= greatest(cfg.th,1);

    ELSIF cfg.rule_code = 'off_hours' THEN
      INSERT INTO _fa SELECT x.sid, cfg.rule_code, x.d, cfg.label,
        format('%s opération(s) enregistrée(s) entre 22 h et 5 h le %s (seuil : %s) : %s.', x.cnt, to_char(x.d,'DD/MM/YYYY'), cfg.th, x.ops),
        jsonb_build_object('count',x.cnt), 'off:'||x.sid||':'||x.d
      FROM (SELECT sid, d, count(*) cnt, string_agg(op, ' ; ' ORDER BY op) ops FROM (
              SELECT m.station_id sid, (m.created_at AT TIME ZONE tz)::date d, format('%s %s L à %s par %s', m.movement_type, m.quantity, to_char(m.created_at AT TIME ZONE tz,'HH24:MI'), coalesce(m.requested_by_name,'?')) op, m.created_at AT TIME ZONE tz lt
              FROM stock_movements m WHERE m.tenant_id=_tenant AND m.country_id=_country AND m.station_id IS NOT NULL
              UNION ALL
              SELECT d.station_id, (a.created_at AT TIME ZONE tz)::date, format('clôture %s à %s par %s', a.action, to_char(a.created_at AT TIME ZONE tz,'HH24:MI'), coalesce(a.user_name,'?')), a.created_at AT TIME ZONE tz
              FROM audit_logs a JOIN daily_closures d ON d.id::text=a.entity_id
              WHERE a.entity_type='daily_closures' AND a.tenant_id=_tenant AND a.country_id=_country
            ) o WHERE d BETWEEN _from AND _to AND (extract(hour FROM lt) >= 22 OR extract(hour FROM lt) < 5)
            GROUP BY sid, d) x
      WHERE x.cnt >= greatest(cfg.th,1);

    ELSIF cfg.rule_code = 'unusual_price' THEN
      INSERT INTO _fa SELECT dc.station_id, cfg.rule_code, dc.closure_date, cfg.label,
        format('Vente %s à %s /L alors que le prix médian du produit sur %s jours est %s /L (écart %s %%, seuil : %s %%). Volume %s L.', coalesce(p.name,'?'), cs.unit_price, cfg.wd, med.m,
               round((cs.unit_price-med.m)/med.m*100,2), cfg.th, cs.volume),
        jsonb_build_object('closure_sale_id',cs.id,'unit_price',cs.unit_price,'median',med.m), 'price:'||cs.id
      FROM closure_sales cs JOIN daily_closures dc ON dc.id=cs.closure_id LEFT JOIN petroleum_products p ON p.id=cs.product_id
      CROSS JOIN LATERAL (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cs2.unit_price)::numeric m FROM closure_sales cs2 JOIN daily_closures d2 ON d2.id=cs2.closure_id
                          WHERE cs2.tenant_id=_tenant AND cs2.country_id=_country AND cs2.product_id=cs.product_id AND d2.status<>'rejected'
                            AND d2.closure_date BETWEEN dc.closure_date - cfg.wd AND dc.closure_date) med
      WHERE cs.tenant_id=_tenant AND cs.country_id=_country AND dc.status<>'rejected' AND dc.closure_date BETWEEN _from AND _to
        AND med.m > 0 AND abs(cs.unit_price-med.m)/med.m*100 > cfg.th;

    ELSIF cfg.rule_code = 'repetitive_transactions' THEN
      INSERT INTO _fa SELECT x.sid, cfg.rule_code, x.d, cfg.label,
        format('%s : %s fois le même %s de %s le %s (seuil : %s).', x.kind, x.cnt, x.what, x.val, to_char(x.d,'DD/MM/YYYY'), cfg.th),
        jsonb_build_object('count',x.cnt,'value',x.val,'kind',x.kind), 'rpt:'||x.sid||':'||x.d||':'||x.kind||':'||x.what||':'||x.val
      FROM (
        SELECT m.station_id sid, (m.movement_date AT TIME ZONE tz)::date d, 'Mouvement de stock' kind, m.movement_type what, m.quantity val, count(*) cnt
        FROM stock_movements m WHERE m.tenant_id=_tenant AND m.country_id=_country AND m.station_id IS NOT NULL AND m.status<>'rejected'
          AND (m.movement_date AT TIME ZONE tz)::date BETWEEN _from AND _to GROUP BY 1,2,3,4,5
        UNION ALL
        SELECT dc.station_id, dc.closure_date, 'Encaissement', pm.label, cp.amount, count(*)
        FROM closure_payments cp JOIN daily_closures dc ON dc.id=cp.closure_id LEFT JOIN payment_methods pm ON pm.id=cp.payment_method_id
        WHERE cp.tenant_id=_tenant AND cp.country_id=_country AND cp.amount > 0 AND dc.closure_date BETWEEN _from AND _to GROUP BY 1,2,3,4,5
      ) x WHERE x.cnt >= greatest(cfg.th,2);

    ELSIF cfg.rule_code = 'sales_collection_mismatch' THEN
      INSERT INTO _fa SELECT dc.station_id, cfg.rule_code, dc.closure_date, cfg.label,
        format('Clôture du %s : ventes %s, encaissements %s, écart %s (%s %% des ventes, seuil : %s %%).', to_char(dc.closure_date,'DD/MM/YYYY'), dc.total_amount, dc.total_collected,
               dc.total_collected - dc.total_amount, round((dc.total_collected - dc.total_amount)/dc.total_amount*100,2), cfg.th),
        jsonb_build_object('closure_id',dc.id,'sales',dc.total_amount,'collected',dc.total_collected), 'cash:'||dc.id||':'||round(dc.total_collected - dc.total_amount)
      FROM daily_closures dc
      WHERE dc.tenant_id=_tenant AND dc.country_id=_country AND dc.status<>'rejected' AND dc.closure_date BETWEEN _from AND _to
        AND dc.total_amount > 0 AND abs(dc.total_collected - dc.total_amount)/dc.total_amount*100 > cfg.th;

    ELSIF cfg.rule_code = 'fuel_card' THEN
      INSERT INTO _fa SELECT x.sid, cfg.rule_code, x.d, cfg.label,
        format('Le %s : transactions Fuel Cards %s F (%s), encaissements « fuel card » déclarés en clôture %s F, écart %s F (seuil : %s F).', to_char(x.d,'DD/MM/YYYY'), x.tx, x.n, x.dec, x.dec - x.tx, cfg.th),
        jsonb_build_object('transactions',x.tx,'count',x.n,'declared',x.dec), 'fcm:'||x.sid||':'||x.d||':'||round(x.dec - x.tx)
      FROM (SELECT s.sid, s.d, sum(s.tx) tx, sum(s.n) n, sum(s.dec) dec FROM (
              SELECT t.station_id sid, (t.occurred_at AT TIME ZONE tz)::date d, t.amount tx, 1 n, 0 dec FROM fuel_card_transactions t
               WHERE t.tenant_id=_tenant AND t.country_id=_country AND t.kind='purchase' AND t.station_id IS NOT NULL AND (t.occurred_at AT TIME ZONE tz)::date BETWEEN _from AND _to
              UNION ALL
              SELECT dc.station_id, dc.closure_date, 0, 0, cp.amount FROM closure_payments cp JOIN daily_closures dc ON dc.id=cp.closure_id JOIN payment_methods pm ON pm.id=cp.payment_method_id
               WHERE cp.tenant_id=_tenant AND cp.country_id=_country AND pm.kind='fuel_card' AND dc.status<>'rejected' AND dc.closure_date BETWEEN _from AND _to) s GROUP BY 1,2) x
      WHERE abs(x.dec - x.tx) > cfg.th;

    ELSIF cfg.rule_code = 'fuel_card_over_limit' THEN
      INSERT INTO _fa SELECT x.station_id, cfg.rule_code, x.d, cfg.label,
        format('Carte %s : transaction %s du %s (%s F, %s L) hors plafond — %s.', x.card_number, x.reference, to_char(x.d,'DD/MM/YYYY'), x.amount, x.litres, array_to_string(x.why, ' ; ')),
        jsonb_build_object('transaction_id',x.id,'card',x.card_number,'reasons',x.why), 'fcl:'||x.id
      FROM (SELECT t.*, fc.card_number, (t.occurred_at AT TIME ZONE tz)::date d, array_remove(ARRAY[
              CASE WHEN fc.restrictions ? 'max_transaction' AND t.amount > (fc.restrictions->>'max_transaction')::numeric THEN format('montant > plafond transaction %s F', fc.restrictions->>'max_transaction') END,
              CASE WHEN fc.restrictions ? 'max_litres' AND t.litres > (fc.restrictions->>'max_litres')::numeric THEN format('volume > plafond %s L', fc.restrictions->>'max_litres') END,
              CASE WHEN fc.restrictions ? 'daily_amount' AND (SELECT sum(amount) FROM fuel_card_transactions z WHERE z.card_id=t.card_id AND z.kind='purchase' AND z.occurred_at>=date_trunc('day',t.occurred_at) AND z.occurred_at<=t.occurred_at) > (fc.restrictions->>'daily_amount')::numeric THEN format('cumul jour > %s F', fc.restrictions->>'daily_amount') END,
              CASE WHEN fc.restrictions ? 'weekly_amount' AND (SELECT sum(amount) FROM fuel_card_transactions z WHERE z.card_id=t.card_id AND z.kind='purchase' AND z.occurred_at>=date_trunc('week',t.occurred_at) AND z.occurred_at<=t.occurred_at) > (fc.restrictions->>'weekly_amount')::numeric THEN format('cumul semaine > %s F', fc.restrictions->>'weekly_amount') END,
              CASE WHEN fc.restrictions ? 'monthly_amount' AND (SELECT sum(amount) FROM fuel_card_transactions z WHERE z.card_id=t.card_id AND z.kind='purchase' AND z.occurred_at>=date_trunc('month',t.occurred_at) AND z.occurred_at<=t.occurred_at) > (fc.restrictions->>'monthly_amount')::numeric THEN format('cumul mois > %s F', fc.restrictions->>'monthly_amount') END,
              CASE WHEN cfg.th > 0 AND t.amount >= cfg.th THEN format('montant ≥ seuil de surveillance %s F', cfg.th) END], NULL) why
            FROM fuel_card_transactions t JOIN fuel_cards fc ON fc.id=t.card_id
            WHERE t.tenant_id=_tenant AND t.country_id=_country AND t.kind='purchase' AND (t.occurred_at AT TIME ZONE tz)::date BETWEEN _from AND _to) x
      WHERE cardinality(x.why) > 0;

    ELSIF cfg.rule_code = 'fuel_card_off_hours' THEN
      INSERT INTO _fa SELECT t.station_id, cfg.rule_code, (t.occurred_at AT TIME ZONE tz)::date, cfg.label,
        format('Carte %s : transaction %s à %s (heure locale), hors plage autorisée %s h – %s h.', fc.card_number, t.reference, to_char(t.occurred_at AT TIME ZONE tz,'DD/MM/YYYY HH24:MI'),
               coalesce(fc.restrictions->>'start_hour','5'), coalesce(fc.restrictions->>'end_hour','22')),
        jsonb_build_object('transaction_id',t.id,'card',fc.card_number,'local_hour',extract(hour FROM t.occurred_at AT TIME ZONE tz)), 'fch:'||t.id
      FROM fuel_card_transactions t JOIN fuel_cards fc ON fc.id=t.card_id
      WHERE t.tenant_id=_tenant AND t.country_id=_country AND t.kind='purchase' AND (t.occurred_at AT TIME ZONE tz)::date BETWEEN _from AND _to
        AND (extract(hour FROM t.occurred_at AT TIME ZONE tz) < coalesce((fc.restrictions->>'start_hour')::numeric,5)
          OR extract(hour FROM t.occurred_at AT TIME ZONE tz) >= coalesce((fc.restrictions->>'end_hour')::numeric,22));

    ELSIF cfg.rule_code = 'fuel_card_restriction' THEN
      INSERT INTO _fa SELECT x.station_id, cfg.rule_code, x.d, cfg.label,
        format('Carte %s : transaction %s du %s hors restrictions — %s.', x.card_number, x.reference, to_char(x.d,'DD/MM/YYYY'), array_to_string(x.why,' ; ')),
        jsonb_build_object('transaction_id',x.id,'card',x.card_number,'reasons',x.why), 'fcr:'||x.id
      FROM (SELECT t.*, fc.card_number, (t.occurred_at AT TIME ZONE tz)::date d, array_remove(ARRAY[
              CASE WHEN jsonb_array_length(coalesce(fc.restrictions->'products','[]'))>0 AND NOT (fc.restrictions->'products' ? t.product_id::text) THEN 'produit non autorisé' END,
              CASE WHEN jsonb_array_length(coalesce(fc.restrictions->'stations','[]'))>0 AND NOT (fc.restrictions->'stations' ? t.station_id::text) THEN 'station non autorisée' END,
              CASE WHEN jsonb_array_length(coalesce(fc.restrictions->'vehicles','[]'))>0 AND (t.vehicle_id IS NULL OR NOT (fc.restrictions->'vehicles' ? t.vehicle_id::text)) THEN 'véhicule non autorisé' END,
              CASE WHEN fc.vehicle_id IS NOT NULL AND fc.vehicle_id IS DISTINCT FROM t.vehicle_id THEN 'véhicule différent de celui de la carte' END], NULL) why
            FROM fuel_card_transactions t JOIN fuel_cards fc ON fc.id=t.card_id
            WHERE t.tenant_id=_tenant AND t.country_id=_country AND t.kind='purchase' AND (t.occurred_at AT TIME ZONE tz)::date BETWEEN _from AND _to) x
      WHERE cardinality(x.why) > 0;
    END IF;

    sevp := CASE cfg.sev WHEN 'critique' THEN 1 WHEN 'haute' THEN 2 WHEN 'moyenne' THEN 3 ELSE 4 END;
    INSERT INTO fraud_alerts (tenant_id, country_id, station_id, rule_code, severity, priority, alert_date, title, explanation, evidence, fingerprint)
    SELECT _tenant, _country, f.station_id, f.rule_code, cfg.sev, sevp, f.alert_date, f.title, f.explanation,
           f.evidence || jsonb_build_object('rule',cfg.rule_code,'threshold',cfg.th,'window_days',cfg.wd), f.fp
    FROM _fa f WHERE f.rule_code = cfg.rule_code
    ON CONFLICT (tenant_id, country_id, fingerprint) DO NOTHING;
    GET DIAGNOSTICS c = ROW_COUNT; n := n + c;
  END LOOP;
  RETURN n;
END $function$;