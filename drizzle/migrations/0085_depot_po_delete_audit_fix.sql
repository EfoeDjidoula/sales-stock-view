CREATE OR REPLACE FUNCTION public.depot_po_edit(_action text, _data jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data,'{}'::jsonb); pf record; po record; who text; l jsonb;
  q numeric; p numeric; r numeric; ht numeric; tx numeric;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE user_id = uid;
  SELECT * INTO pf FROM public.depot_proformas WHERE id = (d->>'proforma_id')::uuid FOR UPDATE;
  IF pf.id IS NULL THEN RAISE EXCEPTION 'Pro-forma introuvable'; END IF;
  IF NOT public.can_access_tenant_country(uid, pf.tenant_id, pf.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(pf.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.has_permission(uid,'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
  SELECT * INTO po FROM public.depot_purchase_orders WHERE proforma_id = pf.id FOR UPDATE;
  IF po.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.depot_lifting_orders WHERE order_id = po.id) THEN
    RAISE EXCEPTION 'Bon de commande % déjà attribué à un bon d''enlèvement : modification ou suppression impossible', po.number; END IF;
  IF EXISTS (SELECT 1 FROM public.depot_proforma_lines WHERE proforma_id = pf.id AND qty_lifted > 0) THEN
    RAISE EXCEPTION 'Quantités déjà enlevées : modification impossible'; END IF;

  IF _action = 'delete' THEN
    PERFORM public.audit_business_event('depot_po_delete','supplies','depot_proforma',pf.id::text,pf.country_id,
      jsonb_build_object('proforma',pf.number,'order',po.number,'total_ttc',pf.total_ttc),NULL);
    IF po.id IS NOT NULL THEN
      PERFORM set_config('lumatek.po_delete','1',true);
      DELETE FROM public.depot_purchase_order_events WHERE order_id = po.id;
      PERFORM set_config('lumatek.po_delete','',true);
      DELETE FROM public.depot_purchase_orders WHERE id = po.id;
    END IF;
    DELETE FROM public.depot_proforma_lines WHERE proforma_id = pf.id;
    DELETE FROM public.depot_proformas WHERE id = pf.id;
    RETURN pf.id;
  ELSIF _action = 'update' THEN
    IF length(btrim(COALESCE(d->>'number',''))) = 0 THEN RAISE EXCEPTION 'Numéro de pro-forma obligatoire'; END IF;
    IF jsonb_typeof(d->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'lines') = 0 THEN RAISE EXCEPTION 'Au moins une ligne produit'; END IF;
    IF NULLIF(d->>'valid_until','')::date < (d->>'proforma_date')::date THEN RAISE EXCEPTION 'Date de validité antérieure à la date du pro-forma'; END IF;
    IF NULLIF(d->>'supplier_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=(d->>'supplier_id')::uuid AND tenant_id=pf.tenant_id) THEN RAISE EXCEPTION 'Fournisseur hors périmètre'; END IF;
    IF NULLIF(d->>'depot_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.depots WHERE id=(d->>'depot_id')::uuid AND tenant_id=pf.tenant_id) THEN RAISE EXCEPTION 'Dépôt hors périmètre'; END IF;
    UPDATE public.depot_proformas SET supplier_id=NULLIF(d->>'supplier_id','')::uuid, depot_id=NULLIF(d->>'depot_id','')::uuid,
      number=btrim(d->>'number'), proforma_date=(d->>'proforma_date')::date, valid_until=NULLIF(d->>'valid_until','')::date,
      observations=NULLIF(btrim(COALESCE(d->>'observations','')),'') WHERE id=pf.id;
    DELETE FROM public.depot_proforma_lines WHERE proforma_id = pf.id;
    FOR l IN SELECT * FROM jsonb_array_elements(d->'lines') LOOP
      q := (l->>'qty_litres')::numeric; p := (l->>'unit_price')::numeric; r := COALESCE(NULLIF(l->>'tax_rate','')::numeric,0);
      IF q IS NULL OR q <= 0 OR p IS NULL OR p < 0 OR r < 0 OR r > 100 THEN RAISE EXCEPTION 'Ligne invalide (quantité > 0, prix ≥ 0, taxe 0–100 %%)'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.petroleum_products WHERE id=(l->>'product_id')::uuid AND tenant_id=pf.tenant_id) THEN RAISE EXCEPTION 'Produit hors périmètre'; END IF;
      ht := round(q*p,2); tx := round(ht*r/100,2);
      INSERT INTO public.depot_proforma_lines (proforma_id, tenant_id, country_id, product_id, qty_litres, unit_price, tax_rate, amount_ht, tax_amount, amount_ttc)
      VALUES (pf.id, pf.tenant_id, pf.country_id, (l->>'product_id')::uuid, q, p, r, ht, tx, ht+tx);
    END LOOP;
    UPDATE public.depot_proformas f SET total_ht=s.h, total_tax=s.x, total_ttc=s.h+s.x
      FROM (SELECT sum(amount_ht) h, sum(tax_amount) x FROM public.depot_proforma_lines WHERE proforma_id=pf.id) s WHERE f.id=pf.id;
    IF po.id IS NOT NULL THEN
      IF length(btrim(COALESCE(d->>'beneficiary_name',''))) > 0 THEN
        IF NULLIF(d->>'client_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id=(d->>'client_id')::uuid AND tenant_id=pf.tenant_id) THEN RAISE EXCEPTION 'Client hors périmètre'; END IF;
        UPDATE public.depot_purchase_orders SET beneficiary_name=btrim(d->>'beneficiary_name'), beneficiary_client_id=NULLIF(d->>'client_id','')::uuid WHERE id=po.id;
      END IF;
      INSERT INTO public.depot_purchase_order_events (order_id, tenant_id, country_id, action, from_status, to_status, reason, author_id, author_name)
      VALUES (po.id, pf.tenant_id, pf.country_id, 'edit', po.payment_status, po.payment_status, 'Modification du bon de commande', uid, who);
    END IF;
    RETURN pf.id;
  END IF;
  RAISE EXCEPTION 'Action inconnue %', _action;
END $f$;