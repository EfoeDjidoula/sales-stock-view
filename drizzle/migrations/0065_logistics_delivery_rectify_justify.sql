CREATE OR REPLACE FUNCTION public.logistics_variance_action(_trip uuid, _action text, _reason text, _data jsonb DEFAULT '{}'::jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data, '{}'::jsonb); r record; l jsonb; ld record;
  q numeric; pending int; newq numeric; cat text; who text;
BEGIN
  SELECT * INTO r FROM public.logistics_trips WHERE id = _trip FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT public.can_access_tenant_country(uid, r.tenant_id, r.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(r.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT public.is_module_enabled(r.tenant_id, r.country_id, 'livraisons') THEN RAISE EXCEPTION 'Module Livraisons désactivé'; END IF;
  IF NOT public.has_permission(uid, 'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
  IF r.status <> 'delivered' THEN RAISE EXCEPTION 'Possible uniquement sur un transport livré'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'Motif obligatoire (5 caractères minimum)'; END IF;
  SELECT full_name INTO who FROM public.profiles WHERE user_id = uid;

  IF _action = 'rectify' THEN
    IF EXISTS (SELECT 1 FROM public.logistics_trip_loads WHERE trip_id = _trip) THEN
      IF jsonb_typeof(d->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'lines') = 0 THEN RAISE EXCEPTION 'Aucune ligne à rectifier'; END IF;
      FOR l IN SELECT * FROM jsonb_array_elements(d->'lines') LOOP
        SELECT * INTO ld FROM public.logistics_trip_loads WHERE id = NULLIF(l->>'load_id', '')::uuid AND trip_id = _trip;
        IF NOT FOUND THEN RAISE EXCEPTION 'Ligne de chargement étrangère au transport'; END IF;
        IF EXISTS (SELECT 1 FROM public.logistics_load_deliveries WHERE load_id = ld.id) THEN
          RAISE EXCEPTION 'Compartiment déjà confirmé sur site : justifiez l''écart au lieu de le modifier';
        END IF;
        q := NULLIF(l->>'qty_delivered', '')::numeric;
        IF q IS NULL OR q < 0 THEN RAISE EXCEPTION 'Quantité livrée invalide'; END IF;
        IF q > ld.qty_litres THEN RAISE EXCEPTION 'Quantité livrée (% L) supérieure au chargement du compartiment (% L)', q, ld.qty_litres; END IF;
        INSERT INTO public.logistics_load_deliveries (tenant_id, country_id, trip_id, load_id, qty_delivered, note, author_id)
        VALUES (r.tenant_id, r.country_id, _trip, ld.id, q, 'Rectification : ' || btrim(_reason), uid);
      END LOOP;
      SELECT count(*) INTO pending FROM public.logistics_trip_loads t WHERE t.trip_id = _trip
        AND NOT EXISTS (SELECT 1 FROM public.logistics_load_deliveries x WHERE x.load_id = t.id);
      IF pending > 0 THEN RAISE EXCEPTION 'Tous les compartiments non confirmés doivent être rectifiés ensemble (% manquant(s))', pending; END IF;
      SELECT sum(qty_delivered) INTO newq FROM public.logistics_load_deliveries WHERE trip_id = _trip;
    ELSE
      newq := NULLIF(d->>'qty_delivered', '')::numeric;
      IF newq IS NULL OR newq <= 0 THEN RAISE EXCEPTION 'Quantité livrée obligatoire'; END IF;
      IF r.qty_loaded IS NOT NULL AND newq > r.qty_loaded THEN RAISE EXCEPTION 'Quantité livrée supérieure à la quantité chargée (% L)', r.qty_loaded; END IF;
    END IF;
    UPDATE public.logistics_trips SET qty_delivered = newq, updated_at = now() WHERE id = _trip;
    INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
    VALUES (_trip, r.tenant_id, r.country_id, 'rectify_delivery', 'delivered', 'delivered', btrim(_reason),
      jsonb_build_object('old_qty', r.qty_delivered, 'new_qty', newq, 'qty_loaded', r.qty_loaded, 'lines', d->'lines'), uid, who);
    RETURN newq;

  ELSIF _action = 'justify' THEN
    cat := COALESCE(NULLIF(d->>'category', ''), 'autre');
    IF cat NOT IN ('perte_transport', 'erreur_saisie', 'evaporation', 'fuite', 'vol_suspecte', 'autre') THEN RAISE EXCEPTION 'Catégorie inconnue'; END IF;
    IF r.qty_loaded IS NULL OR r.qty_delivered IS NULL THEN RAISE EXCEPTION 'Aucun écart à justifier'; END IF;
    INSERT INTO public.logistics_trip_events (trip_id, tenant_id, country_id, action, from_status, to_status, reason, data, author_id, author_name)
    VALUES (_trip, r.tenant_id, r.country_id, 'justify_variance', 'delivered', 'delivered', btrim(_reason),
      jsonb_build_object('category', cat, 'variance', r.qty_delivered - r.qty_loaded, 'qty_loaded', r.qty_loaded, 'qty_delivered', r.qty_delivered), uid, who);
    RETURN r.qty_delivered - r.qty_loaded;
  END IF;
  RAISE EXCEPTION 'Action inconnue %', _action;
END $$;
REVOKE ALL ON FUNCTION public.logistics_variance_action(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_variance_action(uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE VIEW public.logistics_alerts WITH (security_invoker = true) AS
 SELECT 'document_expired'::text AS kind,
    CASE WHEN d.expires_on < CURRENT_DATE THEN 'critical'::text ELSE 'warning'::text END AS severity,
    d.tenant_id, d.country_id, d.id AS entity_id, NULL::uuid AS trip_id,
    (((d.doc_type || ' '::text) || COALESCE(d.doc_number, ''::text)) || ' — '::text) || COALESCE(v.registration, dr.full_name, ''::text) AS label,
    (d.expires_on - CURRENT_DATE)::numeric AS value,
    d.expires_on::timestamp with time zone AS due_at
   FROM public.logistics_documents d
     LEFT JOIN public.logistics_vehicles v ON v.id = d.vehicle_id
     LEFT JOIN public.logistics_drivers dr ON dr.id = d.driver_id
  WHERE d.expires_on IS NOT NULL AND d.expires_on <= (CURRENT_DATE + 30)
UNION ALL
 SELECT 'delivery_late'::text,
    CASE WHEN now() > (t.eta + '06:00:00'::interval) THEN 'critical'::text ELSE 'warning'::text END,
    t.tenant_id, t.country_id, t.id, t.id, t.reference,
    round(EXTRACT(epoch FROM now() - t.eta) / 3600::numeric, 1), t.eta
   FROM public.logistics_trips t
  WHERE t.eta IS NOT NULL AND t.eta < now() AND (t.status <> ALL (ARRAY['delivered'::text, 'arrived'::text, 'unloading'::text]))
UNION ALL
 SELECT 'quantity_variance'::text,
    CASE WHEN abs(t.qty_delivered - t.qty_loaded) > (2::numeric * t.qty_loaded * t.tolerance_pct / 100::numeric) THEN 'critical'::text ELSE 'warning'::text END,
    t.tenant_id, t.country_id, t.id, t.id, t.reference,
    t.qty_delivered - t.qty_loaded, t.delivered_at
   FROM public.logistics_trips t
  WHERE t.qty_loaded > 0::numeric AND t.qty_delivered IS NOT NULL
    AND abs(t.qty_delivered - t.qty_loaded) > (t.qty_loaded * t.tolerance_pct / 100::numeric)
    AND NOT EXISTS (
      SELECT 1 FROM public.logistics_trip_events j
       WHERE j.trip_id = t.id AND j.action = 'justify_variance'
         AND j.created_at >= COALESCE((SELECT max(e.created_at) FROM public.logistics_trip_events e
                                        WHERE e.trip_id = t.id AND e.action IN ('deliver', 'deliver_auto', 'rectify_delivery')), t.delivered_at, '-infinity'::timestamptz))
UNION ALL
 SELECT 'seal_broken'::text, 'critical'::text,
    s.tenant_id, s.country_id, s.id, s.trip_id, 'Scellé '::text || s.serial, NULL::numeric, s.updated_at
   FROM public.logistics_seals s
  WHERE s.status = ANY (ARRAY['broken'::text, 'anomaly'::text]);