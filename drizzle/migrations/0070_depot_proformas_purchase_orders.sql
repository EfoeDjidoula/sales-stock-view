CREATE TABLE public.depot_proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  depot_id uuid REFERENCES public.depots(id),
  number text NOT NULL,
  proforma_date date NOT NULL,
  valid_until date,
  observations text,
  total_ht numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_ttc numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, supplier_id, number)
);
CREATE TABLE public.depot_proforma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_id uuid NOT NULL REFERENCES public.depot_proformas(id),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  qty_litres numeric NOT NULL CHECK (qty_litres > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  tax_rate numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  amount_ht numeric NOT NULL, tax_amount numeric NOT NULL, amount_ttc numeric NOT NULL,
  qty_lifted numeric NOT NULL DEFAULT 0 CHECK (qty_lifted >= 0)
);
CREATE TABLE public.depot_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  proforma_id uuid NOT NULL UNIQUE REFERENCES public.depot_proformas(id),
  number text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  beneficiary_client_id uuid REFERENCES public.clients(id),
  beneficiary_name text NOT NULL,
  payment_status text NOT NULL DEFAULT 'non_paye' CHECK (payment_status IN ('non_paye','pret_credit','paiement_direct')),
  status_by uuid, status_by_name text, status_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, number)
);
CREATE TABLE public.depot_purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.depot_purchase_orders(id),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  action text NOT NULL, from_status text, to_status text, reason text,
  author_id uuid, author_name text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.depot_proforma_lines(proforma_id);
CREATE INDEX ON public.depot_purchase_order_events(order_id);

GRANT SELECT ON public.depot_proformas, public.depot_proforma_lines, public.depot_purchase_orders, public.depot_purchase_order_events TO authenticated;
GRANT ALL ON public.depot_proformas, public.depot_proforma_lines, public.depot_purchase_orders, public.depot_purchase_order_events TO service_role;
ALTER TABLE public.depot_proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depot_proforma_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depot_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depot_purchase_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoped read" ON public.depot_proformas FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "scoped read" ON public.depot_proforma_lines FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "scoped read" ON public.depot_purchase_orders FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "scoped read" ON public.depot_purchase_order_events FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

CREATE OR REPLACE FUNCTION public.depot_po_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historique des bons de commande immuable'; END $$;
CREATE TRIGGER depot_po_events_immutable BEFORE UPDATE OR DELETE ON public.depot_purchase_order_events FOR EACH ROW EXECUTE FUNCTION public.depot_po_events_immutable();

CREATE OR REPLACE FUNCTION public.depot_supply_action(_action text, _data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data, '{}'::jsonb); l jsonb;
  t uuid; c uuid; pid uuid; oid uuid; po record; who text; n int; st text;
  q numeric; p numeric; r numeric; ht numeric; tx numeric;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE user_id = uid;
  IF _action = 'create_proforma' THEN
    t := (d->>'tenant_id')::uuid; c := (d->>'country_id')::uuid;
  ELSE
    SELECT * INTO po FROM public.depot_purchase_orders WHERE id = COALESCE((d->>'order_id')::uuid, '00000000-0000-0000-0000-000000000000') FOR UPDATE;
    IF _action = 'issue_order' THEN
      SELECT tenant_id, country_id INTO t, c FROM public.depot_proformas WHERE id = (d->>'proforma_id')::uuid;
    ELSE
      IF po.id IS NULL THEN RAISE EXCEPTION 'Bon de commande introuvable'; END IF;
      t := po.tenant_id; c := po.country_id;
    END IF;
  END IF;
  IF t IS NULL OR c IS NULL THEN RAISE EXCEPTION 'Périmètre manquant'; END IF;
  IF NOT public.can_access_tenant_country(uid, t, c) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(t) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;

  IF _action = 'create_proforma' THEN
    IF NOT (public.has_permission(uid,'supplies.create') OR public.has_permission(uid,'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.create requis'; END IF;
    IF length(btrim(COALESCE(d->>'number',''))) = 0 THEN RAISE EXCEPTION 'Numéro de pro-forma obligatoire'; END IF;
    IF jsonb_typeof(d->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'lines') = 0 THEN RAISE EXCEPTION 'Au moins une ligne produit'; END IF;
    IF NULLIF(d->>'valid_until','')::date < (d->>'proforma_date')::date THEN RAISE EXCEPTION 'Date de validité antérieure à la date du pro-forma'; END IF;
    IF (d->>'supplier_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=(d->>'supplier_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Fournisseur hors périmètre'; END IF;
    IF (d->>'depot_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depots WHERE id=(d->>'depot_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Dépôt hors périmètre'; END IF;
    INSERT INTO public.depot_proformas (tenant_id, country_id, supplier_id, depot_id, number, proforma_date, valid_until, observations, created_by)
    VALUES (t, c, NULLIF(d->>'supplier_id','')::uuid, NULLIF(d->>'depot_id','')::uuid, btrim(d->>'number'), (d->>'proforma_date')::date,
            NULLIF(d->>'valid_until','')::date, NULLIF(btrim(COALESCE(d->>'observations','')),''), uid) RETURNING id INTO pid;
    FOR l IN SELECT * FROM jsonb_array_elements(d->'lines') LOOP
      q := (l->>'qty_litres')::numeric; p := (l->>'unit_price')::numeric; r := COALESCE(NULLIF(l->>'tax_rate','')::numeric, 0);
      IF q IS NULL OR q <= 0 OR p IS NULL OR p < 0 OR r < 0 OR r > 100 THEN RAISE EXCEPTION 'Ligne invalide (quantité > 0, prix ≥ 0, taxe 0–100 %%)'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.petroleum_products WHERE id=(l->>'product_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Produit hors périmètre'; END IF;
      ht := round(q*p, 2); tx := round(ht*r/100, 2);
      INSERT INTO public.depot_proforma_lines (proforma_id, tenant_id, country_id, product_id, qty_litres, unit_price, tax_rate, amount_ht, tax_amount, amount_ttc)
      VALUES (pid, t, c, (l->>'product_id')::uuid, q, p, r, ht, tx, ht+tx);
    END LOOP;
    UPDATE public.depot_proformas f SET total_ht=s.h, total_tax=s.x, total_ttc=s.h+s.x
      FROM (SELECT sum(amount_ht) h, sum(tax_amount) x FROM public.depot_proforma_lines WHERE proforma_id=pid) s WHERE f.id=pid;
    RETURN pid;

  ELSIF _action = 'issue_order' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    IF EXISTS (SELECT 1 FROM public.depot_purchase_orders WHERE proforma_id=(d->>'proforma_id')::uuid) THEN RAISE EXCEPTION 'Bon de commande déjà émis pour ce pro-forma'; END IF;
    IF (d->>'client_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id=(d->>'client_id')::uuid AND tenant_id=t) THEN RAISE EXCEPTION 'Client hors périmètre'; END IF;
    IF length(btrim(COALESCE(d->>'beneficiary_name',''))) = 0 THEN RAISE EXCEPTION 'Bénéficiaire obligatoire'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('depot_po'||t||c));
    SELECT count(*)+1 INTO n FROM public.depot_purchase_orders WHERE tenant_id=t AND country_id=c AND date_part('year',issue_date)=date_part('year',CURRENT_DATE);
    INSERT INTO public.depot_purchase_orders (tenant_id, country_id, proforma_id, number, beneficiary_client_id, beneficiary_name, status_by, status_by_name, created_by)
    VALUES (t, c, (d->>'proforma_id')::uuid, 'BC-'||to_char(CURRENT_DATE,'YYYY')||'-'||lpad(n::text,4,'0'), NULLIF(d->>'client_id','')::uuid, btrim(d->>'beneficiary_name'), uid, who, uid)
    RETURNING id INTO oid;
    INSERT INTO public.depot_purchase_order_events (order_id, tenant_id, country_id, action, to_status, author_id, author_name)
    VALUES (oid, t, c, 'issue', 'non_paye', uid, who);
    RETURN oid;

  ELSIF _action = 'set_payment_status' THEN
    IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
    st := d->>'status';
    IF st NOT IN ('non_paye','pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Statut inconnu'; END IF;
    IF st = po.payment_status THEN RAISE EXCEPTION 'Statut inchangé'; END IF;
    IF st = 'non_paye' AND EXISTS (SELECT 1 FROM public.depot_proforma_lines WHERE proforma_id=po.proforma_id AND qty_lifted>0) THEN
      RAISE EXCEPTION 'Des enlèvements existent déjà : impossible de repasser en Non payé';
    END IF;
    UPDATE public.depot_purchase_orders SET payment_status=st, status_by=uid, status_by_name=who, status_at=now() WHERE id=po.id;
    INSERT INTO public.depot_purchase_order_events (order_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
    VALUES (po.id, t, c, 'payment_status', po.payment_status, st, NULLIF(btrim(COALESCE(d->>'reason','')),''), uid, who);
    RETURN po.id;
  END IF;
  RAISE EXCEPTION 'Action inconnue %', _action;
END $$;
REVOKE ALL ON FUNCTION public.depot_supply_action(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.depot_supply_action(text, jsonb) TO authenticated;