INSERT INTO public.permissions (code, module, action, label)
SELECT 'fraud.'||a, 'fraud', a, l FROM (VALUES
 ('view','Voir le centre anti-fraude'),('create','Lancer l''analyse anti-fraude'),('edit','Analyser / commenter / demander justification'),
 ('validate','Confirmer / classer faux positif / clore, configurer les règles')) v(a,l)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = 'fraud.'||v.a);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, ps.id FROM public.role_permissions rp
JOIN public.permissions pi ON pi.id = rp.permission_id AND pi.module = 'reconciliation'
JOIN public.permissions ps ON ps.code = 'fraud.'||pi.action
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = ps.id);

CREATE TABLE public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  rule_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  threshold numeric NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  window_days integer NOT NULL DEFAULT 7 CHECK (window_days BETWEEN 1 AND 90),
  severity text NOT NULL DEFAULT 'moyenne' CHECK (severity IN ('faible','moyenne','haute','critique')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, rule_code)
);

CREATE TABLE public.fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid REFERENCES public.stations(id),
  rule_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('faible','moyenne','haute','critique')),
  priority integer NOT NULL DEFAULT 3,
  alert_date date NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL,
  workflow text NOT NULL DEFAULT 'new' CHECK (workflow IN ('new','analysis','justification_requested','confirmed','false_positive','closed')),
  last_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, fingerprint)
);
CREATE INDEX fraud_alerts_scope_idx ON public.fraud_alerts (tenant_id, country_id, alert_date);

CREATE TABLE public.fraud_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.fraud_alerts(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  action text NOT NULL, from_workflow text, to_workflow text, comment text,
  author_id uuid, author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fraud_rules TO authenticated;
GRANT SELECT ON public.fraud_alerts, public.fraud_alert_events TO authenticated;
GRANT ALL ON public.fraud_rules, public.fraud_alerts, public.fraud_alert_events TO service_role;

ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alert_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fraud_rules','fraud_alerts','fraud_alert_events'] LOOP
    EXECUTE format('CREATE POLICY "Scope read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id) AND (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(),''fraud.view'')))', t);
    EXECUTE format('CREATE POLICY "Scope gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''anti_fraude'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''anti_fraude''))', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''anti_fraude'')', t);
  END LOOP;
END $$;
CREATE POLICY "Validators insert" ON public.fraud_rules FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(),'fraud.validate'));
CREATE POLICY "Validators update" ON public.fraud_rules FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(),'fraud.validate'));
CREATE POLICY "License write insert" ON public.fraud_rules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id));
CREATE POLICY "License write update" ON public.fraud_rules AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id));
CREATE TRIGGER trg_fraud_rules_updated BEFORE UPDATE ON public.fraud_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.fraud_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historique anti-fraude immuable'; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.fraud_alert_events FOR EACH ROW EXECUTE FUNCTION public.fraud_events_immutable();
CREATE TRIGGER immutable_alert BEFORE DELETE ON public.fraud_alerts FOR EACH ROW EXECUTE FUNCTION public.fraud_events_immutable();

-- Catalogue des règles par défaut (seuil, fenêtre, sévérité)
CREATE OR REPLACE FUNCTION public.fraud_rule_defaults()
RETURNS TABLE(rule_code text, label text, description text, threshold numeric, window_days int, severity text, is_enabled boolean, unit text)
LANGUAGE sql IMMUTABLE AS $$ VALUES
 ('index_modification','Modification inhabituelle d''index','Nombre de modifications/suppressions d''index (saisie index, lignes de clôture) le même jour pour une station ≥ seuil.',2::numeric,1,'haute',true,'modifications'),
 ('retroactive_adjustment','Ajustement rétroactif','Ajustement / stock initial / inventaire saisi plus de N jours après la date du mouvement.',2,1,'haute',true,'jours de retard'),
 ('abnormal_stock_drop','Baisse anormale de stock','Écart d''inventaire négatif ou sortie par ajustement dépassant le seuil en % du stock théorique / de la capacité.',2,1,'critique',true,'%'),
 ('repeated_variances','Écarts répétés','Nombre de réconciliations en Anomalie ou Critique sur la fenêtre ≥ seuil.',3,7,'haute',true,'écarts'),
 ('cancelled_sales','Ventes annulées inhabituelles','Nombre de clôtures rejetées ou rouvertes + lignes de vente supprimées sur la fenêtre ≥ seuil.',2,7,'moyenne',true,'annulations'),
 ('off_hours','Opération hors horaires','Mouvement de stock ou action de clôture enregistré entre 22 h et 5 h (heure du pays). Seuil = nombre minimum d''opérations.',1,1,'moyenne',true,'opérations'),
 ('unusual_price','Remise / prix inhabituel','Prix unitaire d''une vente s''écartant de plus de N % du prix médian du produit sur la fenêtre.',5,30,'haute',true,'%'),
 ('repetitive_transactions','Transactions répétitives','Même station, même type et même quantité de mouvement (ou même montant d''encaissement) répétés le même jour ≥ seuil.',3,1,'moyenne',true,'répétitions'),
 ('sales_collection_mismatch','Incohérence ventes / encaissements','Écart entre ventes et encaissements d''une clôture supérieur à N % du montant des ventes.',1,1,'haute',true,'%'),
 ('fuel_card','Anomalie fuel card','Réservée aux transactions fuel card détaillées (non disponibles pour l''instant) : aucune alerte générée.',0,1,'moyenne',false,'—')
$$;

CREATE OR REPLACE FUNCTION public.run_fraud_scan(_tenant uuid, _country uuid, _from date, _to date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.fraud_alert_action(_id uuid, _action text, _comment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a record; nxt text; uname text;
BEGIN
  SELECT * INTO a FROM fraud_alerts WHERE id=_id FOR UPDATE;
  IF a IS NULL OR NOT can_access_tenant_country(uid, a.tenant_id, a.country_id) THEN RAISE EXCEPTION 'Alerte inaccessible'; END IF;
  IF NOT is_module_enabled(a.tenant_id, a.country_id, 'anti_fraude') THEN RAISE EXCEPTION 'Module Anti-fraude désactivé'; END IF;
  IF NOT tenant_write_allowed(a.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF _action <> 'analyze' AND coalesce(trim(_comment),'') = '' THEN RAISE EXCEPTION 'Commentaire obligatoire'; END IF;
  IF _action IN ('confirm','false_positive','close','reopen') THEN
    IF NOT (is_platform_admin(uid) OR has_permission(uid,'fraud.validate')) THEN RAISE EXCEPTION 'Droit « valider » requis'; END IF;
  ELSIF NOT (is_platform_admin(uid) OR has_permission(uid,'fraud.edit') OR has_permission(uid,'fraud.validate')) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  nxt := CASE
    WHEN _action='comment' THEN a.workflow
    WHEN _action='analyze' AND a.workflow IN ('new','justification_requested') THEN 'analysis'
    WHEN _action='request_justification' AND a.workflow IN ('new','analysis') THEN 'justification_requested'
    WHEN _action='confirm' AND a.workflow IN ('analysis','justification_requested') THEN 'confirmed'
    WHEN _action='false_positive' AND a.workflow IN ('new','analysis','justification_requested') THEN 'false_positive'
    WHEN _action='close' AND a.workflow IN ('confirmed','false_positive') THEN 'closed'
    WHEN _action='reopen' AND a.workflow IN ('confirmed','false_positive','closed') THEN 'analysis'
    ELSE NULL END;
  IF nxt IS NULL THEN RAISE EXCEPTION 'Action « % » impossible depuis l''état « % »', _action, a.workflow; END IF;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  UPDATE fraud_alerts SET workflow=nxt, last_comment=coalesce(nullif(trim(_comment),''), last_comment), updated_at=now() WHERE id=_id;
  INSERT INTO fraud_alert_events (alert_id, tenant_id, country_id, action, from_workflow, to_workflow, comment, author_id, author_name)
  VALUES (_id, a.tenant_id, a.country_id, _action, a.workflow, nxt, nullif(trim(_comment),''), uid, uname);
  RETURN nxt;
END $$;

GRANT EXECUTE ON FUNCTION public.fraud_rule_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_fraud_scan(uuid,uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fraud_alert_action(uuid,text,text) TO authenticated;