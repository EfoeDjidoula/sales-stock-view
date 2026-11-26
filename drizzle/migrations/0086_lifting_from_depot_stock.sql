ALTER TABLE public.depot_lifting_orders ALTER COLUMN order_id DROP NOT NULL;

DO $mig$
DECLARE s text; pool text;
  FUNCTION_CHECK int;
BEGIN
  pool := $p$FROM public.depot_proforma_lines pl2 JOIN public.depot_proformas f2 ON f2.id = pl2.proforma_id
                JOIN public.depot_purchase_orders o2 ON o2.proforma_id = f2.id AND o2.payment_status IN ('pret_credit','paiement_direct')
                WHERE pl2.tenant_id = t AND pl2.country_id = c AND f2.depot_id = dep AND pl2.product_id = prod.product_id$p$;
  s := pg_get_functiondef('public.depot_supply_action'::regproc);
  s := replace(s, $o$    ELSE
      IF po.id IS NULL THEN RAISE EXCEPTION 'Bon de commande introuvable'; END IF;$o$, $n$    ELSIF _action = 'create_lifting' AND po.id IS NULL THEN
      t := (d->>'tenant_id')::uuid; c := (d->>'country_id')::uuid;
    ELSE
      IF po.id IS NULL THEN RAISE EXCEPTION 'Bon de commande introuvable'; END IF;$n$);
  s := replace(s, $o$    IF po.payment_status NOT IN ('pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Bon de commande % NON PAYÉ : stock bloqué, aucun enlèvement possible', po.number; END IF;
$o$, '');
  s := replace(s, $o$IF truck IS NULL OR drv IS NULL THEN RAISE EXCEPTION 'Camion et chauffeur obligatoires'; END IF;$o$,
    $n$IF truck IS NULL OR drv IS NULL THEN RAISE EXCEPTION 'Camion et chauffeur obligatoires'; END IF;
    IF dep IS NULL THEN RAISE EXCEPTION 'Dépôt de chargement obligatoire'; END IF;$n$);
  s := replace(s, 'INTO avail FROM public.depot_proforma_lines pl2 WHERE pl2.proforma_id = po.proforma_id AND pl2.product_id = prod.product_id;', 'INTO avail ' || pool || ';');
  s := replace(s, $o$      IF NOT EXISTS (SELECT 1 FROM public.depot_proforma_lines WHERE proforma_id = po.proforma_id AND product_id = prod.product_id) THEN
        RAISE EXCEPTION 'Produit absent du bon de commande %', po.number; END IF;
      IF prod.qty > avail THEN RAISE EXCEPTION 'Quantité supérieure au solde disponible du BC % : % L demandés, % L disponibles', po.number, prod.qty, avail; END IF;$o$,
    $n$      IF prod.qty > avail THEN RAISE EXCEPTION 'Stock disponible au dépôt insuffisant pour % : % L demandés, % L disponibles', (SELECT name FROM public.petroleum_products WHERE id = prod.product_id), prod.qty, avail; END IF;$n$);
  s := replace(s, 'FROM public.depot_proforma_lines pl2 WHERE pl2.proforma_id = po.proforma_id AND pl2.product_id = prod.product_id ORDER BY pl2.id LOOP', pool || ' ORDER BY o2.issue_date, o2.created_at, pl2.id LOOP');
  s := replace(s, $o$'Solde du BC insuffisant'$o$, $n$'Stock disponible au dépôt insuffisant'$n$);
  s := replace(s, $o$    IF po.payment_status NOT IN ('pret_credit','paiement_direct') THEN RAISE EXCEPTION 'Bon de commande non payé'; END IF;$o$,
    $n$    IF EXISTS (SELECT 1 FROM public.depot_lifting_lines ll JOIN public.depot_proforma_lines pl2 ON pl2.id = ll.proforma_line_id
               JOIN public.depot_purchase_orders o2 ON o2.proforma_id = pl2.proforma_id
               WHERE ll.lifting_id = be.id AND o2.payment_status NOT IN ('pret_credit','paiement_direct')) THEN RAISE EXCEPTION 'Stock non autorisé (bon de commande non payé)'; END IF;$n$);
  s := replace(s, 'Solde du BC dépassé', 'Stock disponible au dépôt dépassé');
  s := replace(s, $o$OR EXISTS (SELECT 1 FROM public.depot_lifting_orders WHERE order_id=po.id AND status<>'cancelled')$o$,
    $n$OR EXISTS (SELECT 1 FROM public.depot_lifting_lines ll JOIN public.depot_lifting_orders b ON b.id=ll.lifting_id JOIN public.depot_proforma_lines pl2 ON pl2.id=ll.proforma_line_id WHERE pl2.proforma_id=po.proforma_id AND b.status<>'cancelled')$n$);
  IF position('Dépôt de chargement obligatoire' in s) = 0 OR position('f2.depot_id = dep' in s) = 0 OR position('Stock non autorisé' in s) = 0 OR position('po.payment_status NOT IN (''pret_credit'',''paiement_direct'') THEN RAISE' in s) > 0 THEN
    RAISE EXCEPTION 'depot_supply_action rewrite failed';
  END IF;
  EXECUTE s;

  s := pg_get_functiondef('public.depot_po_edit'::regproc);
  s := replace(s, 'IF po.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.depot_lifting_orders WHERE order_id = po.id) THEN',
    'IF (po.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.depot_lifting_orders WHERE order_id = po.id)) OR EXISTS (SELECT 1 FROM public.depot_lifting_lines ll JOIN public.depot_proforma_lines pl2 ON pl2.id = ll.proforma_line_id WHERE pl2.proforma_id = pf.id) THEN');
  IF position('depot_lifting_lines ll JOIN' in s) = 0 THEN RAISE EXCEPTION 'depot_po_edit rewrite failed'; END IF;
  EXECUTE s;
END $mig$;