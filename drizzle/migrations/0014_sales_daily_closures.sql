-- Permissions ventes
INSERT INTO public.permissions (code, module, action, label)
SELECT 'sales.'||a, 'sales', a, l FROM (VALUES
 ('view','Voir les ventes et clôtures'),('create','Saisir les ventes'),('edit','Modifier les ventes'),
 ('validate','Valider / rejeter / rouvrir les clôtures'),('export','Exporter les ventes')) v(a,l)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.code = 'sales.'||v.a);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, ps.id FROM public.role_permissions rp
JOIN public.permissions pi ON pi.id = rp.permission_id AND pi.module = 'index_entries'
JOIN public.permissions ps ON ps.code = 'sales.'||pi.action
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = rp.role_id AND x.permission_id = ps.id);

-- Tables
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  code text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, code)
);

CREATE TABLE public.daily_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  closure_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','validated','rejected')),
  total_volume numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  total_collected numeric NOT NULL DEFAULT 0,
  cash_variance numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  submitted_by uuid, submitted_at timestamptz,
  validated_by uuid, validated_at timestamptz,
  rejected_by uuid, rejected_at timestamptz,
  reopened_by uuid, reopened_at timestamptz,
  last_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, closure_date)
);

CREATE TABLE public.closure_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.daily_closures(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  nozzle_id uuid REFERENCES public.nozzles(id),
  pump_id uuid REFERENCES public.pumps(id),
  tank_id uuid REFERENCES public.tanks(id),
  product_id uuid REFERENCES public.petroleum_products(id),
  index_start numeric,
  index_end numeric,
  volume numeric NOT NULL DEFAULT 0 CHECK (volume >= 0),
  volume_mode text NOT NULL DEFAULT 'index' CHECK (volume_mode IN ('index','manual')),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closure_id, nozzle_id)
);

CREATE TABLE public.closure_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.daily_closures(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (closure_id, payment_method_id)
);

CREATE TABLE public.closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_id uuid NOT NULL REFERENCES public.daily_closures(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods, public.daily_closures, public.closure_sales, public.closure_payments TO authenticated;
GRANT SELECT ON public.closure_events TO authenticated;
GRANT ALL ON public.payment_methods, public.daily_closures, public.closure_sales, public.closure_payments, public.closure_events TO service_role;

-- Seed modes de paiement
CREATE OR REPLACE FUNCTION public.seed_payment_methods(_tenant uuid, _country uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.payment_methods (tenant_id, country_id, code, label, kind, position)
  SELECT _tenant, _country, c, l, k, p FROM (VALUES
    ('cash','Espèces','cash',1),('card','Carte bancaire','card',2),('voucher','Ticket valeur','voucher',3),
    ('momo','Mobile Money','mobile',4),('prepaid_card','Carte carburant prépayée','fuel_card',5),
    ('postpaid_card','Carte carburant post-payée','fuel_card',6),('autoconso','Autoconso','internal',7),
    ('b2b_credit','Crédit B2B','credit',8),('other','Autres','other',9)) v(c,l,k,p)
  ON CONFLICT (tenant_id, country_id, code) DO NOTHING;
$$;
REVOKE EXECUTE ON FUNCTION public.seed_payment_methods(uuid, uuid) FROM PUBLIC, anon, authenticated;

SELECT public.seed_payment_methods(tenant_id, country_id) FROM public.tenant_countries;

CREATE OR REPLACE FUNCTION public.tenant_country_seed_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.seed_payment_methods(NEW.tenant_id, NEW.country_id); RETURN NEW; END $$;
CREATE TRIGGER seed_payment_methods AFTER INSERT ON public.tenant_countries
FOR EACH ROW EXECUTE FUNCTION public.tenant_country_seed_payments();

-- Clôture : garde-fous
CREATE OR REPLACE FUNCTION public.closure_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st record; bypass boolean := current_setting('app.closure_bypass', true) = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Une clôture ne peut pas être supprimée';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT tenant_id, country_id INTO st FROM public.stations WHERE id = NEW.station_id;
    NEW.tenant_id := st.tenant_id; NEW.country_id := st.country_id;
    NEW.status := 'draft'; NEW.created_by := auth.uid();
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
END $$;
REVOKE EXECUTE ON FUNCTION public.closure_before() FROM PUBLIC, anon;
CREATE TRIGGER closure_before BEFORE INSERT OR UPDATE OR DELETE ON public.daily_closures
FOR EACH ROW EXECUTE FUNCTION public.closure_before();

CREATE OR REPLACE FUNCTION public.closure_line_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; cid uuid;
BEGIN
  cid := CASE WHEN TG_OP = 'DELETE' THEN OLD.closure_id ELSE NEW.closure_id END;
  SELECT id, tenant_id, country_id, status, station_id INTO c FROM public.daily_closures WHERE id = cid;
  IF c.status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Clôture verrouillée (statut %) : réouverture tracée obligatoire', c.status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW.closure_id <> OLD.closure_id THEN
    RAISE EXCEPTION 'Changement de clôture interdit';
  END IF;
  NEW.tenant_id := c.tenant_id; NEW.country_id := c.country_id; NEW.updated_at := now();
  IF TG_TABLE_NAME = 'closure_sales' THEN
    IF NEW.nozzle_id IS NOT NULL THEN
      SELECT pump_id, tank_id, product_id INTO NEW.pump_id, NEW.tank_id, NEW.product_id
      FROM public.nozzles WHERE id = NEW.nozzle_id AND station_id = c.station_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Le pistolet n''appartient pas à cette station'; END IF;
    END IF;
    IF NEW.volume_mode = 'index' THEN
      IF NEW.index_start IS NULL OR NEW.index_end IS NULL THEN
        RAISE EXCEPTION 'Index de début et de fin obligatoires';
      END IF;
      IF NEW.index_start < 0 OR NEW.index_end < 0 THEN RAISE EXCEPTION 'Index négatif interdit'; END IF;
      IF NEW.index_end < NEW.index_start THEN
        RAISE EXCEPTION 'L''index de fin (%) est inférieur à l''index de début (%)', NEW.index_end, NEW.index_start;
      END IF;
      NEW.volume := NEW.index_end - NEW.index_start;
    END IF;
    NEW.amount := round(NEW.volume * NEW.unit_price);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.closure_line_before() FROM PUBLIC, anon;
CREATE TRIGGER closure_line_before BEFORE INSERT OR UPDATE OR DELETE ON public.closure_sales
FOR EACH ROW EXECUTE FUNCTION public.closure_line_before();
CREATE TRIGGER closure_line_before BEFORE INSERT OR UPDATE OR DELETE ON public.closure_payments
FOR EACH ROW EXECUTE FUNCTION public.closure_line_before();

CREATE OR REPLACE FUNCTION public.closure_recompute(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric; a numeric; p numeric;
BEGIN
  SELECT COALESCE(sum(volume),0), COALESCE(sum(amount),0) INTO v, a FROM public.closure_sales WHERE closure_id = _id;
  SELECT COALESCE(sum(amount),0) INTO p FROM public.closure_payments WHERE closure_id = _id;
  PERFORM set_config('app.closure_bypass','on',true);
  UPDATE public.daily_closures SET total_volume = v, total_amount = a, total_collected = p, cash_variance = p - a WHERE id = _id;
  PERFORM set_config('app.closure_bypass','off',true);
END $$;
REVOKE EXECUTE ON FUNCTION public.closure_recompute(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.closure_line_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.closure_recompute(CASE WHEN TG_OP = 'DELETE' THEN OLD.closure_id ELSE NEW.closure_id END);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.closure_line_after() FROM PUBLIC, anon;
CREATE TRIGGER closure_line_after AFTER INSERT OR UPDATE OR DELETE ON public.closure_sales
FOR EACH ROW EXECUTE FUNCTION public.closure_line_after();
CREATE TRIGGER closure_line_after AFTER INSERT OR UPDATE OR DELETE ON public.closure_payments
FOR EACH ROW EXECUTE FUNCTION public.closure_line_after();

CREATE OR REPLACE FUNCTION public.closure_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'L''historique des clôtures est immuable'; END $$;
CREATE TRIGGER closure_events_immutable BEFORE UPDATE OR DELETE ON public.closure_events
FOR EACH ROW EXECUTE FUNCTION public.closure_events_immutable();

-- Machine d'états
CREATE OR REPLACE FUNCTION public.closure_transition(_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  c record; r record;
  validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid, 'sales.validate');
  new_status text; ref text;
BEGIN
  SELECT * INTO c FROM public.daily_closures WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_tenant_country(uid, c.tenant_id, c.country_id) THEN
    RAISE EXCEPTION 'Clôture introuvable';
  END IF;
  IF NOT public.tenant_write_allowed(c.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.is_module_enabled(c.tenant_id, c.country_id, 'ventes') THEN RAISE EXCEPTION 'Module Ventes désactivé'; END IF;
  ref := 'CLO-' || to_char(c.closure_date, 'YYYYMMDD') || '-' || left(c.id::text, 6);

  IF _action = 'submit' THEN
    IF c.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'Seul un brouillon ou une clôture rejetée peut être soumis'; END IF;
    IF NOT public.can_write_module(uid, 'sales') THEN RAISE EXCEPTION 'Droit sales.create requis'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.closure_sales WHERE closure_id = _id) THEN RAISE EXCEPTION 'Aucune vente saisie'; END IF;
    new_status := 'submitted';
  ELSIF _action IN ('validate','reject','reopen') THEN
    IF NOT validator THEN RAISE EXCEPTION 'Droit sales.validate requis'; END IF;
    IF _action IN ('reject','reopen') AND COALESCE(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Un motif est obligatoire'; END IF;
    IF _action IN ('validate','reject') AND c.status <> 'submitted' THEN RAISE EXCEPTION 'La clôture doit être soumise'; END IF;
    IF _action = 'reopen' AND c.status <> 'validated' THEN RAISE EXCEPTION 'Seule une clôture validée peut être rouverte'; END IF;
    new_status := CASE _action WHEN 'validate' THEN 'validated' WHEN 'reject' THEN 'rejected' ELSE 'draft' END;
  ELSE
    RAISE EXCEPTION 'Action inconnue %', _action;
  END IF;

  IF _action IN ('validate','reopen') THEN
    FOR r IN SELECT tank_id, product_id, sum(volume) AS vol FROM public.closure_sales
             WHERE closure_id = _id AND tank_id IS NOT NULL AND product_id IS NOT NULL
             GROUP BY tank_id, product_id HAVING sum(volume) > 0 LOOP
      INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, tank_id, product_id,
        movement_type, quantity, reason, reference, movement_date)
      VALUES (c.tenant_id, c.country_id, 'station', c.station_id, r.tank_id, r.product_id,
        CASE WHEN _action = 'validate' THEN 'sale' ELSE 'adjustment_in' END, r.vol,
        CASE WHEN _action = 'validate' THEN 'Ventes clôture du ' || c.closure_date
             ELSE 'Annulation ventes (réouverture clôture du ' || c.closure_date || ') : ' || _reason END,
        ref, c.closure_date::timestamptz + interval '23 hours');
    END LOOP;
  END IF;

  PERFORM set_config('app.closure_bypass','on',true);
  UPDATE public.daily_closures SET status = new_status, last_reason = COALESCE(_reason, last_reason),
    submitted_by = CASE WHEN _action='submit' THEN uid ELSE submitted_by END,
    submitted_at = CASE WHEN _action='submit' THEN now() ELSE submitted_at END,
    validated_by = CASE WHEN _action='validate' THEN uid ELSE validated_by END,
    validated_at = CASE WHEN _action='validate' THEN now() ELSE validated_at END,
    rejected_by = CASE WHEN _action='reject' THEN uid ELSE rejected_by END,
    rejected_at = CASE WHEN _action='reject' THEN now() ELSE rejected_at END,
    reopened_by = CASE WHEN _action='reopen' THEN uid ELSE reopened_by END,
    reopened_at = CASE WHEN _action='reopen' THEN now() ELSE reopened_at END
  WHERE id = _id;
  PERFORM set_config('app.closure_bypass','off',true);

  INSERT INTO public.closure_events (closure_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
  VALUES (_id, c.tenant_id, c.country_id, _action, c.status, new_status, _reason, uid,
          (SELECT full_name FROM public.profiles WHERE user_id = uid));
  RETURN new_status;
END $$;
REVOKE EXECUTE ON FUNCTION public.closure_transition(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.closure_transition(uuid, text, text) TO authenticated;

-- RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closure_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closure_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closure_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','daily_closures','closure_sales','closure_payments','closure_events'] LOOP
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''ventes'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''ventes''))', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''sales'')', t);
    IF t <> 'closure_events' THEN
      EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''sales''))', t);
      EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''sales''))', t);
      EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
      EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    END IF;
  END LOOP;
END $$;
CREATE POLICY "Writers delete" ON public.closure_sales FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), 'sales'));
CREATE POLICY "Writers delete" ON public.closure_payments FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), 'sales'));
CREATE POLICY "Writers delete" ON public.payment_methods FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), 'sales'));

CREATE INDEX ON public.daily_closures (tenant_id, country_id, closure_date);
CREATE INDEX ON public.closure_sales (closure_id);
CREATE INDEX ON public.closure_payments (closure_id);
CREATE INDEX ON public.closure_events (closure_id);