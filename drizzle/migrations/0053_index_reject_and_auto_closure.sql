
ALTER TABLE public.index_entries
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_by_name text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS closure_id uuid;

ALTER TABLE public.daily_closures
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS index_entry_id uuid;
ALTER TABLE public.daily_closures DROP CONSTRAINT IF EXISTS daily_closures_source_check;
ALTER TABLE public.daily_closures ADD CONSTRAINT daily_closures_source_check CHECK (source IN ('manual','index'));

-- Journal immuable des décisions N+1
CREATE TABLE IF NOT EXISTS public.index_entry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL,
  tenant_id uuid,
  country_id uuid,
  station_id uuid,
  entry_date date,
  action text NOT NULL CHECK (action IN ('validate','reject','resubmit')),
  reason text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.index_entry_events TO authenticated;
GRANT ALL ON public.index_entry_events TO service_role;
ALTER TABLE public.index_entry_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoped read index entry events" ON public.index_entry_events;
CREATE POLICY "Scoped read index entry events" ON public.index_entry_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE INDEX IF NOT EXISTS index_entry_events_entry_idx ON public.index_entry_events(entry_id, created_at);

CREATE OR REPLACE FUNCTION public.index_entry_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Journal des décisions N+1 immuable';
END $$;
DROP TRIGGER IF EXISTS index_entry_events_immutable ON public.index_entry_events;
CREATE TRIGGER index_entry_events_immutable BEFORE UPDATE OR DELETE ON public.index_entry_events
  FOR EACH ROW EXECUTE FUNCTION public.index_entry_events_immutable();

-- Verrouillage : statut, validation, rejet et clôture ne sont modifiables que par les procédures
CREATE OR REPLACE FUNCTION public.index_entry_lock_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE via_rpc boolean := coalesce(current_setting('lumatek.index_validate', true),'') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT via_rpc THEN
      NEW.status := 'pre_enregistre'; NEW.validated_by := NULL; NEW.validated_by_name := NULL; NEW.validated_at := NULL;
      NEW.validation_comment := NULL; NEW.sync_warnings := '[]'::jsonb;
      NEW.rejected_by := NULL; NEW.rejected_by_name := NULL; NEW.rejected_at := NULL; NEW.rejection_reason := NULL; NEW.closure_id := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF via_rpc THEN RETURN COALESCE(NEW, OLD); END IF;
  IF OLD.status = 'valide' THEN RAISE EXCEPTION 'Saisie validée par le N+1 : modification impossible'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.validated_by := OLD.validated_by; NEW.validated_by_name := OLD.validated_by_name;
  NEW.validated_at := OLD.validated_at; NEW.sync_warnings := OLD.sync_warnings; NEW.validation_comment := OLD.validation_comment;
  NEW.rejected_by := OLD.rejected_by; NEW.rejected_by_name := OLD.rejected_by_name;
  NEW.rejected_at := OLD.rejected_at; NEW.rejection_reason := OLD.rejection_reason; NEW.closure_id := OLD.closure_id;
  IF OLD.status = 'rejete' THEN
    -- Correction par le gérant : la saisie repart en attente de validation
    NEW.status := 'pre_enregistre';
    INSERT INTO public.index_entry_events(entry_id, tenant_id, country_id, station_id, entry_date, action, reason, author_id, author_name)
    VALUES (OLD.id, OLD.tenant_id, OLD.country_id, OLD.station_id, OLD.entry_date, 'resubmit', 'Saisie corrigée après rejet', auth.uid(),
            (SELECT full_name FROM public.profiles WHERE user_id = auth.uid()));
  ELSE
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END $$;

-- Une clôture créée à la main est toujours d'origine manuelle
CREATE OR REPLACE FUNCTION public.closure_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE st record; bypass boolean := current_setting('app.closure_bypass', true) = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Une clôture ne peut pas être supprimée';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id, country_id INTO st FROM public.stations WHERE id = NEW.station_id;
    NEW.tenant_id := st.tenant_id; NEW.country_id := st.country_id;
    NEW.status := 'draft'; NEW.created_by := auth.uid();
    NEW.source := 'manual'; NEW.index_entry_id := NULL;
    NEW.total_volume := 0; NEW.total_amount := 0; NEW.total_collected := 0; NEW.cash_variance := 0;
    IF NEW.closure_date > current_date THEN
      RAISE EXCEPTION 'Impossible de clôturer une date future';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_years WHERE tenant_id = NEW.tenant_id AND year = extract(year FROM NEW.closure_date)::int AND status = 'closed') THEN
      RAISE EXCEPTION 'Exercice comptable % clôturé', extract(year FROM NEW.closure_date);
    END IF;
    RETURN NEW;
  END IF;
  IF bypass THEN NEW.updated_at := now(); RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Utilisez la procédure de soumission / validation / réouverture';
  END IF;
  IF OLD.status IN ('submitted','validated') THEN
    RAISE EXCEPTION 'Clôture verrouillée (statut %) : réouverture tracée obligatoire', OLD.status;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['notes','updated_at']) THEN
    RAISE EXCEPTION 'Seules les notes peuvent être modifiées directement';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- Rejet N+1 (motif obligatoire)
CREATE OR REPLACE FUNCTION public.reject_index_entry(_id uuid, _reason text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e record; uname text; r text := nullif(btrim(coalesce(_reason,'')),'');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO e FROM index_entries WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT can_access_tenant_country(uid, e.tenant_id, e.country_id) THEN RAISE EXCEPTION 'Saisie introuvable'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid, 'index_entries.validate')) THEN RAISE EXCEPTION 'Rejet réservé au N+1 (index_entries.validate)'; END IF;
  IF e.status = 'valide' THEN RAISE EXCEPTION 'Saisie déjà validée : rejet impossible'; END IF;
  IF e.status = 'rejete' THEN RAISE EXCEPTION 'Saisie déjà rejetée'; END IF;
  IF e.user_id = uid AND NOT is_platform_admin(uid) THEN RAISE EXCEPTION 'Vous ne pouvez pas rejeter votre propre saisie'; END IF;
  IF r IS NULL THEN RAISE EXCEPTION 'Un motif de rejet est obligatoire'; END IF;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  PERFORM set_config('lumatek.index_validate', 'on', true);
  UPDATE index_entries SET status = 'rejete', rejected_by = uid, rejected_by_name = uname, rejected_at = now(), rejection_reason = r WHERE id = _id;
  PERFORM set_config('lumatek.index_validate', 'off', true);
  INSERT INTO index_entry_events(entry_id, tenant_id, country_id, station_id, entry_date, action, reason, author_id, author_name)
  VALUES (_id, e.tenant_id, e.country_id, e.station_id, e.entry_date, 'reject', r, uid, uname);
  PERFORM audit_business_event('index_reject','index_entries','index_entry',_id::text,e.country_id,jsonb_build_object('date',e.entry_date,'reason',r),NULL);
  RETURN 'rejete';
END $$;
REVOKE ALL ON FUNCTION public.reject_index_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_index_entry(uuid, text) TO authenticated;

-- Validation N+1 : stock + clôture journalière générée
CREATE OR REPLACE FUNCTION public.validate_index_entry(_id uuid, _comment text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE uid uuid := auth.uid(); e record; tk record; cl record; pm record; qty numeric; warns jsonb := '[]'::jsonb; ref text; mdate timestamptz; uname text;
  skip_sales boolean := false; v_closure uuid; v_tz text; sp numeric; gp numeric; pre_sum numeric; pre_amt numeric; post_amt numeric; pmid uuid; c2 record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO e FROM index_entries WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT can_access_tenant_country(uid, e.tenant_id, e.country_id) THEN RAISE EXCEPTION 'Saisie introuvable'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid, 'index_entries.validate')) THEN RAISE EXCEPTION 'Validation réservée au N+1 (index_entries.validate)'; END IF;
  IF e.status = 'valide' THEN RAISE EXCEPTION 'Saisie déjà validée'; END IF;
  IF e.status = 'rejete' THEN RAISE EXCEPTION 'Saisie rejetée : le gérant doit d''abord la corriger'; END IF;
  IF e.user_id = uid AND NOT is_platform_admin(uid) THEN RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre saisie'; END IF;
  IF e.entry_date > (now() AT TIME ZONE 'Africa/Porto-Novo')::date THEN RAISE EXCEPTION 'Date future'; END IF;
  IF EXISTS (SELECT 1 FROM index_entries WHERE station_id = e.station_id AND entry_date < e.entry_date AND status <> 'valide') THEN
    RAISE EXCEPTION 'Validez d''abord les saisies antérieures de cette station (ordre chronologique)';
  END IF;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  PERFORM set_config('lumatek.index_validate', 'on', true);
  ref := 'IDX-' || to_char(e.entry_date,'YYYYMMDD') || '-' || left(_id::text, 8);
  mdate := (e.entry_date::timestamp + interval '20 hours') AT TIME ZONE 'Africa/Porto-Novo';

  SELECT * INTO cl FROM daily_closures WHERE station_id = e.station_id AND closure_date = e.entry_date;
  skip_sales := FOUND AND cl.status = 'validated';
  IF skip_sales THEN
    warns := warns || jsonb_build_array('Clôture du jour déjà validée dans Ventes & Clôtures : conservée, ventes non repassées au stock');
  END IF;

  FOR tk IN SELECT t.id, t.name, t.product_id, r.jauge FROM tanks t
            LEFT JOIN index_tank_readings r ON r.entry_id = _id AND r.tank_id = t.id
            WHERE t.station_id = e.station_id AND (r.id IS NOT NULL OR EXISTS (SELECT 1 FROM pump_index_entries p WHERE p.entry_id = _id AND p.tank_id = t.id)) LOOP
    IF tk.product_id IS NULL THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : produit non configuré, stock non mis à jour'); CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM stock_movements WHERE reference = ref AND tank_id = tk.id) THEN CONTINUE; END IF;
    SELECT coalesce(sum(coalesce(liters_net, liters_sold)),0) INTO qty FROM pump_index_entries WHERE entry_id = _id AND tank_id = tk.id;
    BEGIN
      IF qty > 0 AND NOT skip_sales THEN
        INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,reason,reference,movement_date)
        VALUES (e.tenant_id,e.country_id,'station',e.station_id,tk.id,tk.product_id,'sale',qty,'Sorties nettes pistolets (saisie index validée)',ref,mdate);
      END IF;
    EXCEPTION WHEN others THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : vente non passée au stock (' || SQLERRM || ')');
    END;
    BEGIN
      IF tk.jauge IS NOT NULL THEN
        INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,physical_level,reason,reference,movement_date)
        VALUES (e.tenant_id,e.country_id,'station',e.station_id,tk.id,tk.product_id,'inventory',0,tk.jauge,'Jauge du soir (saisie index validée)',ref,mdate);
      END IF;
    EXCEPTION WHEN others THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : jauge non passée au stock (' || SQLERRM || ')');
    END;
  END LOOP;

  -- Clôture journalière générée (Ventes & Clôtures)
  IF NOT is_module_enabled(e.tenant_id, e.country_id, 'ventes') THEN
    NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM pump_index_entries WHERE entry_id = _id) THEN
    warns := warns || jsonb_build_array('Ancien format sans détail par pistolet : clôture du jour non générée');
  ELSIF cl.id IS NOT NULL AND cl.status IN ('validated','submitted') THEN
    v_closure := cl.id;
    IF cl.status = 'submitted' THEN
      warns := warns || jsonb_build_array('Clôture du jour déjà soumise à la main : non remplacée, à traiter dans Ventes & Clôtures');
    END IF;
  ELSE
    BEGIN
      IF cl.id IS NULL THEN
        INSERT INTO daily_closures(station_id, closure_date, notes)
        VALUES (e.station_id, e.entry_date, 'Générée par la validation N+1 de la saisie index')
        RETURNING id INTO v_closure;
      ELSE
        v_closure := cl.id;
        DELETE FROM closure_sales WHERE closure_id = v_closure;
        DELETE FROM closure_payments WHERE closure_id = v_closure;
      END IF;
      SELECT tenant_id, country_id INTO c2 FROM daily_closures WHERE id = v_closure;

      SELECT super_price, gasoil_price INTO sp, gp FROM price_structures
      WHERE is_active AND effective_date <= e.entry_date
        AND tenant_id IS NOT DISTINCT FROM e.tenant_id AND (country_id IS NULL OR country_id = e.country_id)
      ORDER BY effective_date DESC LIMIT 1;
      sp := coalesce(nullif(sp,0), 695); gp := coalesce(nullif(gp,0), 720);

      INSERT INTO closure_sales(closure_id, tenant_id, country_id, pump_id, tank_id, product_id, volume_mode, volume, unit_price)
      SELECT v_closure, c2.tenant_id, c2.country_id, p.pump_id, p.tank_id, t.product_id, 'manual',
             coalesce(p.liters_net, p.liters_sold, 0), CASE WHEN p.product_type = 'super' THEN sp ELSE gp END
      FROM pump_index_entries p LEFT JOIN tanks t ON t.id = p.tank_id
      WHERE p.entry_id = _id AND coalesce(p.liters_net, p.liters_sold, 0) > 0;

      -- Cartes : part prépayée selon les transactions Fuel Cards du jour, le reste en post-payé
      v_tz := coalesce((SELECT timezone FROM countries WHERE id = e.country_id), 'Africa/Porto-Novo');
      SELECT coalesce(sum(tx.amount),0) INTO pre_sum FROM fuel_card_transactions tx
        JOIN fuel_card_accounts a ON a.id = tx.account_id
      WHERE tx.station_id = e.station_id AND tx.kind = 'purchase' AND a.kind = 'prepaid'
        AND (tx.occurred_at AT TIME ZONE v_tz)::date = e.entry_date;
      pre_amt := least(coalesce(e.cartes_montant,0), pre_sum);
      post_amt := coalesce(e.cartes_montant,0) - pre_amt;

      FOR pm IN SELECT * FROM (VALUES
          ('autoconso'::text, coalesce(e.autoconso_montant,0)::numeric, NULL::text),
          ('b2b_credit', coalesce(e.bons_clients_montant,0), NULL),
          ('voucher', coalesce(e.tickets_valeur_montant,0), NULL),
          ('prepaid_card', pre_amt, NULL),
          ('postpaid_card', post_amt, NULL),
          ('momo', coalesce(e.versement_momo,0), e.versement_momo_ref),
          ('cash', coalesce(e.versement_banque,0) + coalesce(e.versement_liquidite,0), e.versement_banque_ref)
        ) v(code, amt, refx) WHERE amt > 0 LOOP
        pmid := NULL;
        SELECT id INTO pmid FROM payment_methods
        WHERE tenant_id = c2.tenant_id AND country_id = c2.country_id AND code = pm.code AND is_active LIMIT 1;
        IF pmid IS NULL THEN
          warns := warns || jsonb_build_array('Mode de règlement « ' || pm.code || ' » inactif : ' || pm.amt || ' FCFA non repris dans la clôture');
          CONTINUE;
        END IF;
        INSERT INTO closure_payments(closure_id, tenant_id, country_id, payment_method_id, amount, reference)
        VALUES (v_closure, c2.tenant_id, c2.country_id, pmid, pm.amt, pm.refx);
      END LOOP;

      PERFORM set_config('app.closure_bypass','on',true);
      UPDATE daily_closures SET status = 'validated', source = 'index', index_entry_id = _id,
        submitted_by = e.user_id, submitted_at = now(), validated_by = uid, validated_at = now()
      WHERE id = v_closure;
      PERFORM set_config('app.closure_bypass','off',true);
      INSERT INTO closure_events(closure_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
      VALUES (v_closure, c2.tenant_id, c2.country_id, 'validate', coalesce(cl.status,'draft'), 'validated',
              'Validation N+1 de la saisie index du ' || to_char(e.entry_date,'DD/MM/YYYY'), uid, uname);
    EXCEPTION WHEN others THEN
      warns := warns || jsonb_build_array('Clôture du jour non générée (' || SQLERRM || ')');
      v_closure := NULL;
    END;
  END IF;

  UPDATE index_entries SET status = 'valide', validated_by = uid, validated_by_name = uname, validated_at = now(),
    validation_comment = nullif(trim(coalesce(_comment,'')),''), sync_warnings = warns, closure_id = v_closure WHERE id = _id;
  INSERT INTO index_entry_events(entry_id, tenant_id, country_id, station_id, entry_date, action, reason, author_id, author_name)
  VALUES (_id, e.tenant_id, e.country_id, e.station_id, e.entry_date, 'validate', nullif(trim(coalesce(_comment,'')),''), uid, uname);
  PERFORM audit_business_event('index_validate','index_entries','index_entry',_id::text,e.country_id,
    jsonb_build_object('date',e.entry_date,'warnings',warns,'closure_id',v_closure),NULL);
  RETURN jsonb_build_object('id',_id,'warnings',warns,'closure_id',v_closure);
END $function$;
REVOKE ALL ON FUNCTION public.validate_index_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_index_entry(uuid, text) TO authenticated;
