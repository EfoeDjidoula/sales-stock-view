INSERT INTO public.permissions (code, module, action, label)
SELECT 'reconciliation.'||a, 'reconciliation', a, l FROM (VALUES
 ('view','Voir les réconciliations'),('create','Lancer les réconciliations'),('edit','Analyser / commenter / demander justification'),
 ('validate','Valider / escalader les anomalies'),('export','Exporter les réconciliations')) v(a,l)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = 'reconciliation.'||v.a);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, ps.id FROM public.role_permissions rp
JOIN public.permissions pi ON pi.id = rp.permission_id AND pi.module = 'sales'
JOIN public.permissions ps ON ps.code = 'reconciliation.'||pi.action
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = ps.id);

CREATE TABLE public.reconciliation_tolerances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  product_id uuid REFERENCES public.petroleum_products(id),
  vol_watch_pct numeric NOT NULL DEFAULT 0.3 CHECK (vol_watch_pct >= 0),
  vol_anomaly_pct numeric NOT NULL DEFAULT 0.5 CHECK (vol_anomaly_pct >= 0),
  vol_critical_pct numeric NOT NULL DEFAULT 1.0 CHECK (vol_critical_pct >= 0),
  amt_watch numeric NOT NULL DEFAULT 5000 CHECK (amt_watch >= 0),
  amt_anomaly numeric NOT NULL DEFAULT 20000 CHECK (amt_anomaly >= 0),
  amt_critical numeric NOT NULL DEFAULT 100000 CHECK (amt_critical >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, country_id, product_id),
  CHECK (vol_watch_pct <= vol_anomaly_pct AND vol_anomaly_pct <= vol_critical_pct AND amt_watch <= amt_anomaly AND amt_anomaly <= amt_critical)
);

CREATE TABLE public.reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  recon_date date NOT NULL,
  closure_id uuid REFERENCES public.daily_closures(id),
  result text NOT NULL DEFAULT 'conforme' CHECK (result IN ('conforme','surveiller','anomalie','critique')),
  workflow text NOT NULL DEFAULT 'open' CHECK (workflow IN ('open','analysis','justification_requested','justified','validated','escalated')),
  sales_volume numeric NOT NULL DEFAULT 0,
  sales_amount numeric NOT NULL DEFAULT 0,
  collected_amount numeric NOT NULL DEFAULT 0,
  volume_variance numeric NOT NULL DEFAULT 0,
  value_variance numeric NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_comment text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, recon_date)
);

CREATE TABLE public.reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.reconciliations(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  action text NOT NULL, from_workflow text, to_workflow text, result text, comment text, data jsonb,
  author_id uuid, author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reconciliation_tolerances TO authenticated;
GRANT SELECT ON public.reconciliations, public.reconciliation_events TO authenticated;
GRANT ALL ON public.reconciliation_tolerances, public.reconciliations, public.reconciliation_events TO service_role;

ALTER TABLE public.reconciliation_tolerances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['reconciliation_tolerances','reconciliations','reconciliation_events'] LOOP
    EXECUTE format('CREATE POLICY "Scope read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Scope gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''ventes'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''ventes''))', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''reconciliation'')', t);
  END LOOP;
END $$;
CREATE POLICY "Validators insert" ON public.reconciliation_tolerances FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(),'reconciliation.validate'));
CREATE POLICY "Validators update" ON public.reconciliation_tolerances FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(),'reconciliation.validate'));
CREATE POLICY "License write insert" ON public.reconciliation_tolerances AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id));
CREATE POLICY "License write update" ON public.reconciliation_tolerances AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id));
CREATE TRIGGER trg_recon_tol_updated BEFORE UPDATE ON public.reconciliation_tolerances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.reconciliation_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historique de réconciliation immuable'; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.reconciliation_events FOR EACH ROW EXECUTE FUNCTION public.reconciliation_events_immutable();

CREATE OR REPLACE FUNCTION public.recon_classify(_pct numeric, _amt numeric, _t public.reconciliation_tolerances)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN abs(coalesce(_pct,0)) > _t.vol_critical_pct OR abs(coalesce(_amt,0)) > _t.amt_critical THEN 'critique'
    WHEN abs(coalesce(_pct,0)) > _t.vol_anomaly_pct OR abs(coalesce(_amt,0)) > _t.amt_anomaly THEN 'anomalie'
    WHEN abs(coalesce(_pct,0)) > _t.vol_watch_pct OR abs(coalesce(_amt,0)) > _t.amt_watch THEN 'surveiller'
    ELSE 'conforme' END
$$;

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
        AND (movement_date AT TIME ZONE 'Africa/Porto-Novo')::date = _date;
    SELECT CASE WHEN lower(coalesce(p.code,'')||p.name) LIKE '%gas%' OR lower(coalesce(p.code,'')||p.name) LIKE '%diesel%'
                THEN sum(greatest(total_gasoil_liters,0)) ELSE sum(greatest(total_super_liters,0)) END
      INTO v_legacy FROM index_entries WHERE station_id = _station AND entry_date = _date;
    unit := CASE WHEN v_sales > 0 THEN a_sales / v_sales ELSE 0 END;
    -- Écart principal : sorties cuves vs ventes enregistrées (si clôture validée), sinon index vs ventes
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
REVOKE EXECUTE ON FUNCTION public.reconcile_station_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_station_day(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconciliation_action(_id uuid, _action text, _comment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r record; nw text; uname text;
  analyst boolean; validator boolean;
BEGIN
  SELECT * INTO r FROM reconciliations WHERE id = _id;
  IF r IS NULL OR NOT can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Réconciliation inaccessible'; END IF;
  IF NOT tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  validator := is_platform_admin(uid) OR has_permission(uid,'reconciliation.validate');
  analyst := validator OR has_permission(uid,'reconciliation.edit');
  IF _action IN ('comment','analyze','request_justification','justify','escalate','validate','reopen') AND coalesce(trim(_comment),'') = '' AND _action NOT IN ('analyze') THEN
    RAISE EXCEPTION 'Commentaire obligatoire'; END IF;
  CASE _action
    WHEN 'comment' THEN IF NOT analyst AND NOT has_permission(uid,'reconciliation.create') THEN RAISE EXCEPTION 'Droit insuffisant'; END IF; nw := r.workflow;
    WHEN 'analyze' THEN IF NOT analyst THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
      IF r.workflow NOT IN ('open','justified','escalated') THEN RAISE EXCEPTION 'Transition impossible depuis %', r.workflow; END IF; nw := 'analysis';
    WHEN 'request_justification' THEN IF NOT analyst THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
      IF r.workflow = 'validated' THEN RAISE EXCEPTION 'Déjà validée'; END IF; nw := 'justification_requested';
    WHEN 'justify' THEN IF NOT (analyst OR has_permission(uid,'reconciliation.create') OR has_permission(uid,'sales.create')) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
      IF r.workflow <> 'justification_requested' THEN RAISE EXCEPTION 'Aucune justification demandée'; END IF; nw := 'justified';
    WHEN 'escalate' THEN IF NOT analyst THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
      IF r.workflow = 'validated' THEN RAISE EXCEPTION 'Déjà validée'; END IF; nw := 'escalated';
    WHEN 'validate' THEN IF NOT validator THEN RAISE EXCEPTION 'Droit de validation requis'; END IF;
      IF r.workflow = 'validated' THEN RAISE EXCEPTION 'Déjà validée'; END IF; nw := 'validated';
    WHEN 'reopen' THEN IF NOT validator THEN RAISE EXCEPTION 'Droit de validation requis'; END IF;
      IF r.workflow <> 'validated' THEN RAISE EXCEPTION 'Seule une réconciliation validée peut être rouverte'; END IF; nw := 'open';
    ELSE RAISE EXCEPTION 'Action inconnue %', _action;
  END CASE;
  UPDATE reconciliations SET workflow = nw, last_comment = coalesce(nullif(trim(_comment),''), last_comment), updated_at = now() WHERE id = _id;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  INSERT INTO reconciliation_events (reconciliation_id, tenant_id, country_id, action, from_workflow, to_workflow, result, comment, author_id, author_name)
  VALUES (_id, r.tenant_id, r.country_id, _action, r.workflow, nw, r.result, nullif(trim(_comment),''), uid, uname);
  RETURN nw;
END $$;
REVOKE EXECUTE ON FUNCTION public.reconciliation_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconciliation_action(uuid, text, text) TO authenticated;