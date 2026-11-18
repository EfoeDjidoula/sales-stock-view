
CREATE TABLE public.b2b_portal_users (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  full_name text NOT NULL,
  email text NOT NULL,
  can_manage boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX b2b_portal_users_client_idx ON public.b2b_portal_users(client_id);
GRANT SELECT ON public.b2b_portal_users TO authenticated;
GRANT ALL ON public.b2b_portal_users TO service_role;
ALTER TABLE public.b2b_portal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.b2b_portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT ('DC-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,5))),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  requested_by uuid NOT NULL,
  requester_name text,
  kind text NOT NULL CHECK (kind IN ('credit_limit','card_unblock','other')),
  amount numeric CHECK (amount IS NULL OR amount > 0),
  card_id uuid REFERENCES public.fuel_cards(id),
  message text NOT NULL CHECK (length(trim(message)) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','declined')),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX b2b_portal_requests_client_idx ON public.b2b_portal_requests(client_id, created_at DESC);
CREATE INDEX b2b_portal_requests_scope_idx ON public.b2b_portal_requests(tenant_id, country_id, status);
GRANT SELECT ON public.b2b_portal_requests TO authenticated;
GRANT ALL ON public.b2b_portal_requests TO service_role;
ALTER TABLE public.b2b_portal_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.b2b_portal_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Une demande client ne peut pas être supprimée'; END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'Demande déjà traitée'; END IF;
  IF NEW.client_id <> OLD.client_id OR NEW.kind <> OLD.kind OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.message <> OLD.message OR NEW.requested_by <> OLD.requested_by OR NEW.card_id IS DISTINCT FROM OLD.card_id THEN
    RAISE EXCEPTION 'Le contenu d''une demande ne peut pas être modifié';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b2b_portal_requests_guard BEFORE UPDATE OR DELETE ON public.b2b_portal_requests
  FOR EACH ROW EXECUTE FUNCTION public.b2b_portal_requests_guard();

-- Portal users never get tenant-wide access: every tenant/country policy relies on get_user_tenant.
CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.tenant_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.b2b_portal_users bp WHERE bp.user_id = p.user_id)
    AND (
      auth.uid() IS NULL
      OR _user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
      OR p.tenant_id = (SELECT me.tenant_id FROM public.profiles me WHERE me.user_id = auth.uid() LIMIT 1)
    )
  LIMIT 1
$function$;

CREATE POLICY "Portal user reads own access" ON public.b2b_portal_users FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)
        AND (public.has_permission(auth.uid(), 'clients.view') OR public.is_platform_admin(auth.uid()))));

CREATE POLICY "Client or staff reads portal requests" ON public.b2b_portal_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.b2b_portal_users bp WHERE bp.user_id = auth.uid() AND bp.active AND bp.client_id = b2b_portal_requests.client_id)
    OR (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)
        AND (public.has_permission(auth.uid(), 'clients.view') OR public.is_platform_admin(auth.uid()))));

CREATE OR REPLACE FUNCTION public.b2b_portal_me()
RETURNS public.b2b_portal_users LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.b2b_portal_users;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO m FROM public.b2b_portal_users WHERE user_id = auth.uid();
  IF NOT FOUND OR NOT m.active THEN RAISE EXCEPTION 'Accès à l''espace client désactivé'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = m.client_id AND c.is_active AND c.tenant_id = m.tenant_id AND c.country_id = m.country_id) THEN
    RAISE EXCEPTION 'Compte client inactif';
  END IF;
  IF NOT (public.is_module_enabled(m.tenant_id, m.country_id, 'clients_b2b') OR public.is_module_enabled(m.tenant_id, m.country_id, 'cartes_carburant')) THEN
    RAISE EXCEPTION 'Espace client non activé pour ce pays';
  END IF;
  RETURN m;
END $$;
REVOKE EXECUTE ON FUNCTION public.b2b_portal_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_portal_overview(_since date DEFAULT (current_date - 120))
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.b2b_portal_users; v_b2b boolean; v_cards boolean; terms public.b2b_terms; exposure numeric; acc uuid[]; s date;
BEGIN
  m := public.b2b_portal_me();
  s := greatest(coalesce(_since, current_date - 120), current_date - 400);
  v_b2b := public.is_module_enabled(m.tenant_id, m.country_id, 'clients_b2b');
  v_cards := public.is_module_enabled(m.tenant_id, m.country_id, 'cartes_carburant');
  SELECT * INTO terms FROM public.b2b_terms WHERE client_id = m.client_id AND tenant_id = m.tenant_id AND country_id = m.country_id
    ORDER BY effective_at DESC, created_at DESC LIMIT 1;
  SELECT coalesce(array_agg(id), '{}') INTO acc FROM public.fuel_card_accounts
    WHERE client_id = m.client_id AND tenant_id = m.tenant_id AND country_id = m.country_id;
  exposure := coalesce((SELECT sum(credit_used) FROM public.fuel_card_accounts WHERE id = ANY(acc) AND kind = 'postpaid'), 0)
    + coalesce((SELECT sum(amount) FROM public.b2b_consumptions WHERE client_id = m.client_id AND tenant_id = m.tenant_id AND country_id = m.country_id), 0)
    - coalesce((SELECT sum(p.amount) FROM public.b2b_payments p JOIN public.b2b_invoices i ON i.id = p.invoice_id
                WHERE i.client_id = m.client_id AND p.tenant_id = m.tenant_id AND p.country_id = m.country_id), 0);

  RETURN jsonb_build_object(
    'me', jsonb_build_object('full_name', m.full_name, 'email', m.email, 'can_manage', m.can_manage),
    'modules', jsonb_build_object('b2b', v_b2b, 'cards', v_cards),
    'since', s,
    'tenant', (SELECT jsonb_build_object('name', coalesce(t.trade_name, t.name), 'logo_url', t.logo_url, 'phone', t.phone, 'email', t.email,
                 'currency', t.default_currency, 'language', t.default_language, 'show_powered_by', t.show_powered_by, 'powered_by_label', t.powered_by_label)
               FROM public.tenants t WHERE t.id = m.tenant_id),
    'client', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name, 'email', c.email, 'phone', c.phone, 'address', c.address)
               FROM public.clients c WHERE c.id = m.client_id),
    'terms', CASE WHEN terms.id IS NULL THEN NULL ELSE jsonb_build_object('credit_limit', terms.credit_limit, 'payment_days', terms.payment_days,
               'policy', terms.policy, 'contract_reference', terms.contract_reference, 'effective_at', terms.effective_at) END,
    'exposure', exposure,
    'accounts', CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'contract_reference', a.contract_reference,
               'credit_limit', a.credit_limit, 'prepaid_balance', a.prepaid_balance, 'credit_used', a.credit_used, 'status', a.status) ORDER BY a.created_at)
               FROM public.fuel_card_accounts a WHERE a.id = ANY(acc)), '[]') ELSE '[]' END,
    'cards', CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'account_id', c.account_id,
               'card_number', '•••• ' || right(c.card_number, 4), 'holder_name', c.holder_name, 'expires_on', c.expires_on,
               'allocated_limit', c.allocated_limit, 'remaining', c.remaining, 'status', c.status, 'vehicle_id', c.vehicle_id, 'driver_id', c.driver_id) ORDER BY c.created_at)
               FROM public.fuel_cards c WHERE c.account_id = ANY(acc) AND c.status <> 'replaced'), '[]') ELSE '[]' END,
    'drivers', CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'account_id', d.account_id, 'name', d.name, 'phone', d.phone, 'active', d.active) ORDER BY d.name)
               FROM public.fuel_card_drivers d WHERE d.account_id = ANY(acc)), '[]') ELSE '[]' END,
    'vehicles', CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'account_id', v.account_id, 'plate', v.plate, 'description', v.description, 'active', v.active) ORDER BY v.plate)
               FROM public.fuel_card_vehicles v WHERE v.account_id = ANY(acc)), '[]') ELSE '[]' END,
    'transactions', CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(x ORDER BY (x->>'occurred_at') DESC) FROM (
               SELECT jsonb_build_object('id', t.id, 'occurred_at', t.occurred_at, 'kind', t.kind, 'amount', t.amount, 'litres', t.litres, 'reference', t.reference,
                 'card_id', t.card_id, 'driver_id', t.driver_id, 'vehicle_id', t.vehicle_id,
                 'station', (SELECT st.name FROM public.stations st WHERE st.id = t.station_id),
                 'product', (SELECT pp.name FROM public.petroleum_products pp WHERE pp.id = t.product_id)) x
               FROM public.fuel_card_transactions t WHERE t.account_id = ANY(acc) AND t.occurred_at >= s
               ORDER BY t.occurred_at DESC LIMIT 2000) q), '[]') ELSE '[]' END,
    'consumptions', CASE WHEN v_b2b THEN coalesce((SELECT jsonb_agg(x ORDER BY (x->>'consumed_on') DESC) FROM (
               SELECT jsonb_build_object('id', b.id, 'consumed_on', b.consumed_on, 'reference', b.reference, 'litres', b.litres, 'unit_price', b.unit_price, 'amount', b.amount,
                 'station', (SELECT st.name FROM public.stations st WHERE st.id = b.station_id),
                 'product', (SELECT pp.name FROM public.petroleum_products pp WHERE pp.id = b.product_id)) x
               FROM public.b2b_consumptions b WHERE b.client_id = m.client_id AND b.tenant_id = m.tenant_id AND b.country_id = m.country_id AND b.consumed_on >= s
               ORDER BY b.consumed_on DESC LIMIT 2000) q), '[]') ELSE '[]' END,
    'invoices', (
      CASE WHEN v_b2b THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'source', 'b2b', 'number', i.number, 'period_start', i.period_start, 'period_end', i.period_end,
               'due_on', i.due_on, 'amount', i.amount,
               'paid', coalesce((SELECT sum(p.amount) FROM public.b2b_payments p WHERE p.invoice_id = i.id), 0)) ORDER BY i.period_end DESC)
               FROM public.b2b_invoices i WHERE i.client_id = m.client_id AND i.tenant_id = m.tenant_id AND i.country_id = m.country_id), '[]') ELSE '[]' END
      ||
      CASE WHEN v_cards THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'source', 'cards', 'number', f.number, 'period_start', f.period_start, 'period_end', f.period_end,
               'due_on', f.due_on, 'amount', f.amount, 'paid', f.paid) ORDER BY f.period_end DESC)
               FROM public.fuel_card_invoices f WHERE f.account_id = ANY(acc)), '[]') ELSE '[]' END),
    'payments', CASE WHEN v_b2b THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'invoice_id', p.invoice_id, 'amount', p.amount, 'reference', p.reference, 'paid_on', p.paid_on) ORDER BY p.paid_on DESC)
               FROM public.b2b_payments p JOIN public.b2b_invoices i ON i.id = p.invoice_id
               WHERE i.client_id = m.client_id AND p.tenant_id = m.tenant_id AND p.country_id = m.country_id), '[]') ELSE '[]' END,
    'requests', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'kind', r.kind, 'amount', r.amount, 'card_id', r.card_id,
               'message', r.message, 'status', r.status, 'created_at', r.created_at, 'decided_at', r.decided_at, 'decision_comment', r.decision_comment,
               'requester_name', r.requester_name) ORDER BY r.created_at DESC)
               FROM (SELECT * FROM public.b2b_portal_requests WHERE client_id = m.client_id ORDER BY created_at DESC LIMIT 100) r), '[]')
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.b2b_portal_overview(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_overview(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_portal_action(_action text, _data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.b2b_portal_users; v_acc uuid; v_id uuid; c public.fuel_cards; terms public.b2b_terms; v_amount numeric; v_open int;
BEGIN
  m := public.b2b_portal_me();
  IF NOT m.can_manage THEN RAISE EXCEPTION 'Votre accès est en consultation seule'; END IF;
  IF NOT public.tenant_write_allowed(m.tenant_id) THEN RAISE EXCEPTION 'Action momentanément impossible (licence en lecture seule)'; END IF;

  IF _action IN ('block_card','assign_card','add_driver','add_vehicle','set_driver','set_vehicle')
     AND NOT public.is_module_enabled(m.tenant_id, m.country_id, 'cartes_carburant') THEN
    RAISE EXCEPTION 'Cartes carburant non activées';
  END IF;

  IF _action IN ('block_card','assign_card') THEN
    SELECT fc.* INTO c FROM public.fuel_cards fc JOIN public.fuel_card_accounts a ON a.id = fc.account_id
      WHERE fc.id = nullif(_data->>'card_id','')::uuid AND a.client_id = m.client_id AND a.tenant_id = m.tenant_id AND a.country_id = m.country_id
      FOR UPDATE OF fc;
    IF NOT FOUND THEN RAISE EXCEPTION 'Carte introuvable'; END IF;
    IF _action = 'block_card' THEN
      IF c.status <> 'active' THEN RAISE EXCEPTION 'Seule une carte active peut être bloquée'; END IF;
      UPDATE public.fuel_cards SET status = 'blocked' WHERE id = c.id;
    ELSE
      IF nullif(_data->>'driver_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fuel_card_drivers d WHERE d.id = (_data->>'driver_id')::uuid AND d.account_id = c.account_id AND d.active) THEN
        RAISE EXCEPTION 'Conducteur inconnu ou inactif'; END IF;
      IF nullif(_data->>'vehicle_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fuel_card_vehicles v WHERE v.id = (_data->>'vehicle_id')::uuid AND v.account_id = c.account_id AND v.active) THEN
        RAISE EXCEPTION 'Véhicule inconnu ou inactif'; END IF;
      UPDATE public.fuel_cards SET driver_id = nullif(_data->>'driver_id','')::uuid, vehicle_id = nullif(_data->>'vehicle_id','')::uuid WHERE id = c.id;
    END IF;
    v_id := c.id;

  ELSIF _action IN ('add_driver','add_vehicle') THEN
    SELECT id INTO v_acc FROM public.fuel_card_accounts WHERE id = nullif(_data->>'account_id','')::uuid
      AND client_id = m.client_id AND tenant_id = m.tenant_id AND country_id = m.country_id;
    IF v_acc IS NULL THEN RAISE EXCEPTION 'Compte carte introuvable'; END IF;
    IF _action = 'add_driver' THEN
      IF length(trim(coalesce(_data->>'name',''))) < 2 THEN RAISE EXCEPTION 'Nom du conducteur obligatoire'; END IF;
      INSERT INTO public.fuel_card_drivers(tenant_id, country_id, account_id, name, phone, active)
        VALUES (m.tenant_id, m.country_id, v_acc, left(trim(_data->>'name'),120), nullif(left(trim(coalesce(_data->>'phone','')),40),''), true) RETURNING id INTO v_id;
    ELSE
      IF length(trim(coalesce(_data->>'plate',''))) < 2 THEN RAISE EXCEPTION 'Immatriculation obligatoire'; END IF;
      IF EXISTS (SELECT 1 FROM public.fuel_card_vehicles v WHERE v.account_id = v_acc AND upper(v.plate) = upper(trim(_data->>'plate'))) THEN
        RAISE EXCEPTION 'Ce véhicule existe déjà'; END IF;
      INSERT INTO public.fuel_card_vehicles(tenant_id, country_id, account_id, plate, description, active)
        VALUES (m.tenant_id, m.country_id, v_acc, upper(left(trim(_data->>'plate'),30)), nullif(left(trim(coalesce(_data->>'description','')),120),''), true) RETURNING id INTO v_id;
    END IF;

  ELSIF _action = 'set_driver' THEN
    UPDATE public.fuel_card_drivers d SET active = coalesce((_data->>'active')::boolean, false)
      FROM public.fuel_card_accounts a WHERE d.id = nullif(_data->>'id','')::uuid AND a.id = d.account_id
        AND a.client_id = m.client_id AND a.tenant_id = m.tenant_id AND a.country_id = m.country_id RETURNING d.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Conducteur introuvable'; END IF;
    IF NOT coalesce((_data->>'active')::boolean, false) THEN UPDATE public.fuel_cards SET driver_id = NULL WHERE driver_id = v_id; END IF;

  ELSIF _action = 'set_vehicle' THEN
    UPDATE public.fuel_card_vehicles v SET active = coalesce((_data->>'active')::boolean, false)
      FROM public.fuel_card_accounts a WHERE v.id = nullif(_data->>'id','')::uuid AND a.id = v.account_id
        AND a.client_id = m.client_id AND a.tenant_id = m.tenant_id AND a.country_id = m.country_id RETURNING v.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Véhicule introuvable'; END IF;
    IF NOT coalesce((_data->>'active')::boolean, false) THEN UPDATE public.fuel_cards SET vehicle_id = NULL WHERE vehicle_id = v_id; END IF;

  ELSIF _action = 'request' THEN
    SELECT count(*) INTO v_open FROM public.b2b_portal_requests WHERE client_id = m.client_id AND status = 'open';
    IF v_open >= 5 THEN RAISE EXCEPTION 'Vous avez déjà 5 demandes en attente de réponse'; END IF;
    IF _data->>'kind' = 'credit_limit' THEN
      v_amount := nullif(_data->>'amount','')::numeric;
      SELECT * INTO terms FROM public.b2b_terms WHERE client_id = m.client_id AND tenant_id = m.tenant_id AND country_id = m.country_id
        ORDER BY effective_at DESC, created_at DESC LIMIT 1;
      IF terms.id IS NULL THEN RAISE EXCEPTION 'Aucun contrat de crédit en vigueur : contactez votre gestionnaire'; END IF;
      IF v_amount IS NULL OR v_amount <= terms.credit_limit THEN RAISE EXCEPTION 'Le nouveau plafond doit dépasser le plafond actuel (%)', terms.credit_limit; END IF;
      IF v_amount > 1e12 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
    ELSIF _data->>'kind' = 'card_unblock' THEN
      SELECT fc.* INTO c FROM public.fuel_cards fc JOIN public.fuel_card_accounts a ON a.id = fc.account_id
        WHERE fc.id = nullif(_data->>'card_id','')::uuid AND a.client_id = m.client_id AND a.tenant_id = m.tenant_id AND a.country_id = m.country_id;
      IF NOT FOUND OR c.status <> 'blocked' THEN RAISE EXCEPTION 'Choisissez une carte bloquée'; END IF;
    ELSIF coalesce(_data->>'kind','') <> 'other' THEN
      RAISE EXCEPTION 'Type de demande inconnu';
    END IF;
    INSERT INTO public.b2b_portal_requests(tenant_id, country_id, client_id, requested_by, requester_name, kind, amount, card_id, message)
      VALUES (m.tenant_id, m.country_id, m.client_id, auth.uid(), m.full_name, _data->>'kind',
              CASE WHEN _data->>'kind' = 'credit_limit' THEN v_amount END,
              CASE WHEN _data->>'kind' = 'card_unblock' THEN c.id END,
              left(trim(coalesce(_data->>'message','')), 1000))
      RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'Action inconnue';
  END IF;

  PERFORM public.audit_business_event('portal_' || _action, 'clients_b2b', 'b2b_client', m.client_id::text, m.country_id,
    jsonb_build_object('target', v_id, 'data', _data - 'message'), NULL);
  RETURN jsonb_build_object('id', v_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.b2b_portal_action(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_action(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_portal_staff_guard(_client uuid)
RETURNS public.clients LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO c FROM public.clients WHERE id = _client;
  IF NOT FOUND OR c.tenant_id IS NULL OR c.country_id IS NULL THEN RAISE EXCEPTION 'Client introuvable'; END IF;
  IF NOT public.can_access_tenant_country(auth.uid(), c.tenant_id, c.country_id) THEN RAISE EXCEPTION 'Périmètre société/pays non autorisé'; END IF;
  IF NOT (public.has_permission(auth.uid(), 'clients.edit') OR public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Permission clients.edit requise'; END IF;
  IF NOT public.is_module_enabled(c.tenant_id, c.country_id, 'clients_b2b') THEN RAISE EXCEPTION 'Module Clients B2B non activé'; END IF;
  IF NOT public.tenant_write_allowed(c.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule : action impossible'; END IF;
  RETURN c;
END $$;
REVOKE EXECUTE ON FUNCTION public.b2b_portal_staff_guard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_staff_guard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_portal_staff_action(_action text, _data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients; m public.b2b_portal_users; r public.b2b_portal_requests; terms public.b2b_terms; uname text; v_card public.fuel_cards;
BEGIN
  IF _action = 'update_user' THEN
    SELECT * INTO m FROM public.b2b_portal_users WHERE user_id = nullif(_data->>'user_id','')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Accès introuvable'; END IF;
    c := public.b2b_portal_staff_guard(m.client_id);
    UPDATE public.b2b_portal_users SET active = coalesce((_data->>'active')::boolean, active),
      can_manage = coalesce((_data->>'can_manage')::boolean, can_manage), updated_at = now() WHERE user_id = m.user_id;
    PERFORM public.audit_business_event('portal_user_update', 'clients_b2b', 'b2b_client', c.id::text, c.country_id, _data, NULL);
    RETURN jsonb_build_object('user_id', m.user_id);

  ELSIF _action = 'decide' THEN
    SELECT * INTO r FROM public.b2b_portal_requests WHERE id = nullif(_data->>'request_id','')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
    IF r.status <> 'open' THEN RAISE EXCEPTION 'Demande déjà traitée'; END IF;
    c := public.b2b_portal_staff_guard(r.client_id);
    IF _data->>'decision' NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Décision invalide'; END IF;
    IF _data->>'decision' = 'declined' AND length(trim(coalesce(_data->>'comment',''))) < 3 THEN RAISE EXCEPTION 'Motif du refus obligatoire'; END IF;
    IF _data->>'decision' = 'accepted' THEN
      IF r.kind = 'credit_limit' THEN
        SELECT * INTO terms FROM public.b2b_terms WHERE client_id = r.client_id AND tenant_id = r.tenant_id AND country_id = r.country_id
          ORDER BY effective_at DESC, created_at DESC LIMIT 1;
        IF terms.id IS NULL THEN RAISE EXCEPTION 'Aucun contrat de crédit en vigueur'; END IF;
        INSERT INTO public.b2b_terms(tenant_id, country_id, client_id, contract_reference, effective_at, credit_limit, payment_days, policy, alert_levels, negotiated_prices, site_ids, actor_id, reason)
          VALUES (terms.tenant_id, terms.country_id, terms.client_id, terms.contract_reference, now(), r.amount, terms.payment_days, terms.policy,
                  terms.alert_levels, terms.negotiated_prices, terms.site_ids, auth.uid(), 'Demande client ' || r.reference);
      ELSIF r.kind = 'card_unblock' THEN
        IF NOT (public.has_permission(auth.uid(), 'fuel_cards.edit') OR public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Permission fuel_cards.edit requise'; END IF;
        SELECT * INTO v_card FROM public.fuel_cards WHERE id = r.card_id FOR UPDATE;
        IF NOT FOUND OR v_card.status <> 'blocked' OR v_card.expires_on < current_date THEN RAISE EXCEPTION 'Cette carte ne peut pas être réactivée'; END IF;
        UPDATE public.fuel_cards SET status = 'active' WHERE id = v_card.id;
      END IF;
    END IF;
    SELECT full_name INTO uname FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
    UPDATE public.b2b_portal_requests SET status = _data->>'decision', decided_by = auth.uid(), decided_by_name = uname, decided_at = now(),
      decision_comment = nullif(left(trim(coalesce(_data->>'comment','')), 1000), '') WHERE id = r.id;
    PERFORM public.audit_business_event('portal_request_' || (_data->>'decision'), 'clients_b2b', 'b2b_portal_request', r.id::text, c.country_id, _data, NULL);
    RETURN jsonb_build_object('id', r.id);
  END IF;
  RAISE EXCEPTION 'Action inconnue';
END $$;
REVOKE EXECUTE ON FUNCTION public.b2b_portal_staff_action(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_portal_staff_action(text, jsonb) TO authenticated;
