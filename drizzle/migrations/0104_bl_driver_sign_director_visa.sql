ALTER TABLE public.depot_lifting_orders
  ADD COLUMN IF NOT EXISTS director_signature_png text,
  ADD COLUMN IF NOT EXISTS director_signed_by uuid,
  ADD COLUMN IF NOT EXISTS director_signed_by_name text,
  ADD COLUMN IF NOT EXISTS director_signed_at timestamptz;

CREATE OR REPLACE FUNCTION public.logistics_bl_received(_note uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(x.load_id, x.qty), '{}'::jsonb) FROM (
    SELECT (l->>'load_id')::uuid load_id,
      coalesce((SELECT sum(qty_measured) FROM logistics_discharges dc WHERE dc.load_id = (l->>'load_id')::uuid),
               (SELECT sum(qty_delivered) FROM logistics_load_deliveries dl WHERE dl.load_id = (l->>'load_id')::uuid)) qty
    FROM logistics_delivery_notes n, jsonb_array_elements(n.snapshot->'lines') l WHERE n.id = _note) x
  WHERE x.qty IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.logistics_bl_received(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.logistics_bl_generate_internal(_trip uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t logistics_trips; dest record; sid uuid; bid uuid; be depot_lifting_orders; cnt integer:=0; content jsonb; identity jsonb;
BEGIN
 SELECT * INTO t FROM logistics_trips WHERE id=_trip FOR UPDATE;
 IF NOT FOUND OR t.loaded_at IS NULL OR t.status IN ('planned','loading','cancelled') THEN RETURN 0; END IF;
 SELECT * INTO be FROM depot_lifting_orders WHERE trip_id=t.id AND status='signed'; bid := be.id;
 SELECT jsonb_build_object('tenantId',te.id,'companyName',te.name,'legalName',coalesce(nullif(tc.legal_name,''),te.legal_name,te.name),'logoUrl',te.logo_url,'primaryColor',te.primary_color,'secondaryColor',te.secondary_color,'countryName',c.name,'address',coalesce(tc.address,te.address),'phone',coalesce(tc.phone,te.phone),'email',coalesce(tc.email,te.email),'website',te.website,'taxId',coalesce(tc.tax_id,te.tax_id),'bankDetails',coalesce(tc.bank_details,te.bank_details),'currency',coalesce(tc.currency,te.default_currency),'language',te.default_language,'appDescription',te.app_description,'poweredBy',CASE WHEN te.show_powered_by THEN te.powered_by_label ELSE null END) INTO identity FROM tenants te JOIN countries c ON c.id=t.country_id LEFT JOIN tenant_countries tc ON tc.tenant_id=te.id AND tc.country_id=t.country_id WHERE te.id=t.tenant_id;
 FOR dest IN SELECT DISTINCT destination_type,station_id,client_id FROM logistics_trip_loads WHERE trip_id=t.id LOOP
 SELECT jsonb_build_object('site',coalesce(st.name,cl.name),'trip',t.reference,'be',be.number,'truck',(SELECT registration FROM logistics_vehicles WHERE id=t.truck_id),'tanker',(SELECT registration FROM logistics_vehicles WHERE id=t.tanker_id),'driver',(SELECT full_name FROM logistics_drivers WHERE id=t.driver_id),'license',(SELECT license_number FROM logistics_drivers WHERE id=t.driver_id),'loaded_at',t.loaded_at,'brand',identity,'seals',coalesce((SELECT jsonb_agg(serial ORDER BY serial) FROM logistics_seals WHERE trip_id=t.id),'[]'::jsonb),'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('load_id',l.id,'product',p.name,'compartment',cp.position,'litres',l.qty_litres) ORDER BY l.stop_order,cp.position) FROM logistics_trip_loads l JOIN petroleum_products p ON p.id=l.product_id LEFT JOIN logistics_compartments cp ON cp.id=l.compartment_id WHERE l.trip_id=t.id AND l.station_id IS NOT DISTINCT FROM dest.station_id AND l.client_id IS NOT DISTINCT FROM dest.client_id),'[]'::jsonb)) INTO content FROM (SELECT 1) dummy LEFT JOIN stations st ON st.id=dest.station_id LEFT JOIN clients cl ON cl.id=dest.client_id;
 sid:=null;
 INSERT INTO logistics_delivery_notes(tenant_id,country_id,trip_id,lifting_id,site_key,station_id,client_id,snapshot,shipper_user) VALUES(t.tenant_id,t.country_id,t.id,bid,dest.destination_type||':'||coalesce(dest.station_id,dest.client_id)::text,dest.station_id,dest.client_id,content,be.signed_by) ON CONFLICT(trip_id,site_key) DO NOTHING RETURNING id INTO sid;
 IF sid IS NOT NULL THEN
   cnt:=cnt+1; INSERT INTO logistics_delivery_note_events(note_id,action,actor) VALUES(sid,'generated',auth.uid());
   IF be.signature_png IS NOT NULL AND be.signed_by IS NOT NULL THEN
     INSERT INTO logistics_delivery_note_signatures(note_id,role,signed_by,signer_name,signature_png,decision,signed_at) VALUES(sid,'shipper',be.signed_by,coalesce(be.signed_by_name,'Responsable logistique'),be.signature_png,'signed',coalesce(be.signed_at,now()));
     INSERT INTO logistics_delivery_note_events(note_id,action,actor,details) VALUES(sid,'signed',be.signed_by,jsonb_build_object('role','shipper','decision','signed','source','lifting_order'));
   END IF;
 END IF;
 END LOOP;
 RETURN cnt; END $$;

CREATE OR REPLACE FUNCTION public.logistics_bl_action(_action text, _id uuid, _data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n logistics_delivery_notes; t logistics_trips; uid uuid:=auth.uid(); r text; assigned uuid; nm text; dec text; a uuid; c uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
 IF _action='generate' THEN
 SELECT * INTO t FROM logistics_trips WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT can_access_tenant_country(uid,t.tenant_id,t.country_id) OR NOT (has_permission(uid,'supplies.validate') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT tenant_write_allowed(t.tenant_id) OR NOT (is_module_enabled(t.tenant_id,t.country_id,'logistique') OR is_module_enabled(t.tenant_id,t.country_id,'logistique_avancee')) THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
 RETURN jsonb_build_object('generated',logistics_bl_generate_internal(_id)); END IF;
 SELECT * INTO n FROM logistics_delivery_notes WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bon introuvable'; END IF;
 SELECT * INTO t FROM logistics_trips WHERE id=n.trip_id;
 IF t.status='cancelled' THEN RAISE EXCEPTION 'Transport annulé'; END IF;
 IF NOT tenant_write_allowed(n.tenant_id) OR NOT (is_module_enabled(n.tenant_id,n.country_id,'logistique') OR is_module_enabled(n.tenant_id,n.country_id,'logistique_avancee')) THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
 IF _action='assign' THEN
 IF NOT can_access_tenant_country(uid,n.tenant_id,n.country_id) OR NOT(has_permission(uid,'supplies.validate') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 a:=coalesce(NULLIF(_data->>'shipper','')::uuid, n.shipper_user); c:=NULLIF(_data->>'consignee','')::uuid;
 IF c IS NULL THEN RAISE EXCEPTION 'Destinataire requis'; END IF;
 IF a IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=a AND p.tenant_id=n.tenant_id AND p.is_active) OR EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=a) OR NOT can_access_tenant_country(a,n.tenant_id,n.country_id)) THEN RAISE EXCEPTION 'Compte logistique hors périmètre'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=c AND p.tenant_id=n.tenant_id AND p.is_active) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=c) AND can_access_tenant_country(c,n.tenant_id,n.country_id) AND (n.station_id IS NULL OR EXISTS(SELECT 1 FROM station_assignments WHERE user_id=c AND station_id=n.station_id))) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users bp WHERE bp.user_id=c AND bp.active AND bp.can_manage AND bp.tenant_id=n.tenant_id AND bp.country_id=n.country_id AND bp.client_id=n.client_id) THEN RAISE EXCEPTION 'Destinataire non habilité pour ce site'; END IF;
 IF EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=n.id) THEN RAISE EXCEPTION 'Bon de livraison déjà signé : le destinataire ne peut plus être changé'; END IF;
 UPDATE logistics_delivery_notes SET shipper_user=a,carrier_user=NULL,consignee_user=c WHERE id=n.id;
 INSERT INTO logistics_delivery_note_events(note_id,action,actor,details) VALUES(n.id,'assigned',uid,jsonb_build_object('shipper',a,'consignee',c));
 ELSE
 IF _action<>'sign' THEN RAISE EXCEPTION 'Action inconnue'; END IF;
 r:=_data->>'role';
 IF r IS NULL OR r NOT IN ('shipper','carrier','consignee') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
 IF coalesce(_data->>'png','') NOT LIKE 'data:image/png;base64,%' OR length(_data->>'png')>400000 THEN RAISE EXCEPTION 'Signature manuscrite obligatoire'; END IF;
 IF r='carrier' THEN
   IF NOT can_access_tenant_country(uid,n.tenant_id,n.country_id) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid AND active AND can_manage AND client_id=n.client_id AND tenant_id=n.tenant_id AND country_id=n.country_id) THEN RAISE EXCEPTION 'Compte non habilité'; END IF;
   IF NOT (uid = n.consignee_user OR uid = n.shipper_user
           OR (has_permission(uid,'supplies.validate') AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid))
           OR (n.station_id IS NOT NULL AND has_permission(uid,'depotages.create') AND EXISTS(SELECT 1 FROM station_assignments WHERE user_id=uid AND station_id=n.station_id))) THEN RAISE EXCEPTION 'Seul le destinataire, le gérant de la station ou la logistique peut recueillir la signature du chauffeur'; END IF;
   nm := n.snapshot->>'driver';
   IF length(trim(coalesce(nm,'')))<2 THEN RAISE EXCEPTION 'Aucun chauffeur rattaché au camion de ce transport'; END IF;
 ELSE
   assigned:=CASE r WHEN 'shipper' THEN n.shipper_user ELSE n.consignee_user END;
   IF assigned IS NULL OR assigned<>uid THEN RAISE EXCEPTION 'Seul le signataire désigné peut signer avec son propre compte'; END IF;
   IF NOT (can_access_tenant_country(uid,n.tenant_id,n.country_id) AND EXISTS(SELECT 1 FROM profiles WHERE user_id=uid AND is_active) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid)) AND NOT(r='consignee' AND EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid AND active AND can_manage AND client_id=n.client_id AND tenant_id=n.tenant_id AND country_id=n.country_id)) THEN RAISE EXCEPTION 'Compte non habilité'; END IF;
   SELECT coalesce((SELECT full_name FROM b2b_portal_users WHERE user_id=uid AND active),(SELECT full_name FROM profiles WHERE user_id=uid)) INTO nm;
   IF length(trim(coalesce(nm,'')))<2 THEN RAISE EXCEPTION 'Nom du compte requis'; END IF;
 END IF;
 IF r='carrier' AND NOT EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=n.id AND role='shipper') OR r='consignee' AND NOT EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=n.id AND role='carrier') THEN RAISE EXCEPTION 'Signature précédente requise'; END IF;
 IF r='shipper' AND t.departed_at IS NOT NULL THEN RAISE EXCEPTION 'Signature de départ trop tardive'; END IF;
 IF r='consignee' AND (t.status NOT IN ('arrived','unloading','delivered') OR EXISTS(SELECT 1 FROM jsonb_array_elements(n.snapshot->'lines') l WHERE NOT EXISTS(SELECT 1 FROM logistics_load_deliveries d WHERE d.load_id=(l->>'load_id')::uuid))) THEN RAISE EXCEPTION 'Confirmez d’abord la livraison de ce site'; END IF;
 dec:=CASE WHEN r='consignee' THEN _data->>'decision' ELSE 'signed' END;
 IF dec IS NULL OR (r='consignee' AND dec NOT IN ('accepted','accepted_with_reserves','refused')) THEN RAISE EXCEPTION 'Décision invalide'; END IF;
 IF dec IN ('accepted_with_reserves','refused') AND length(trim(coalesce(_data->>'reserves','')))<3 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
 INSERT INTO logistics_delivery_note_signatures(note_id,role,signed_by,signer_name,signature_png,decision,reserves) VALUES(n.id,r,uid,trim(nm),_data->>'png',dec,nullif(trim(_data->>'reserves'),''));
 INSERT INTO logistics_delivery_note_events(note_id,action,actor,details) VALUES(n.id,'signed',uid,jsonb_build_object('role',r,'decision',dec)||CASE WHEN r='carrier' THEN jsonb_build_object('driver',trim(nm),'collected_by',uid) ELSE '{}'::jsonb END);
 END IF;
 RETURN jsonb_build_object('id',n.id);
END $$;

CREATE OR REPLACE FUNCTION public.logistics_bl_overview(_tenant uuid DEFAULT NULL::uuid, _country uuid DEFAULT NULL::uuid, _offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid:=auth.uid(); bp b2b_portal_users; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
 SELECT * INTO bp FROM b2b_portal_users WHERE user_id=uid AND active;
 IF bp.user_id IS NOT NULL THEN _tenant:=bp.tenant_id; _country:=bp.country_id;
 ELSIF _tenant IS NULL OR _country IS NULL OR NOT can_access_tenant_country(uid,_tenant,_country) OR NOT(has_permission(uid,'supplies.view') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT (is_module_enabled(_tenant,_country,'logistique') OR is_module_enabled(_tenant,_country,'logistique_avancee')) THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO result FROM (
 SELECT to_jsonb(n)||jsonb_build_object('trip_status',t.status,'received',logistics_bl_received(n.id),'signatures',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY signed_at) FROM logistics_delivery_note_signatures s WHERE s.note_id=n.id),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at) FROM logistics_delivery_note_events e WHERE e.note_id=n.id),'[]'::jsonb)) item FROM logistics_delivery_notes n JOIN logistics_trips t ON t.id=n.trip_id WHERE n.tenant_id=_tenant AND n.country_id=_country AND (bp.user_id IS NULL OR (n.client_id=bp.client_id AND n.consignee_user=uid)) ORDER BY n.created_at DESC,n.id LIMIT 100 OFFSET greatest(0,_offset)) rows;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.b2b_portal_delivery_notes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.b2b_portal_users;
BEGIN
  m := public.b2b_portal_me();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', n.id, 'number', n.number, 'trip_id', n.trip_id, 'tenant_id', n.tenant_id, 'country_id', n.country_id, 'created_at', n.created_at,
    'trip_status', t.status, 'shipper_user', n.shipper_user, 'carrier_user', n.carrier_user, 'consignee_user', n.consignee_user,
    'station_id', n.station_id, 'client_id', n.client_id, 'snapshot', n.snapshot, 'received', logistics_bl_received(n.id),
    'signatures', coalesce((SELECT jsonb_agg(jsonb_build_object('role', s.role, 'signed_by', s.signed_by, 'signer_name', s.signer_name, 'signature_png', s.signature_png, 'signed_at', s.signed_at, 'decision', s.decision, 'reserves', s.reserves) ORDER BY s.signed_at) FROM logistics_delivery_note_signatures s WHERE s.note_id = n.id), '[]'::jsonb),
    'events', '[]'::jsonb) ORDER BY n.created_at DESC)
    FROM logistics_delivery_notes n JOIN logistics_trips t ON t.id = n.trip_id
    WHERE n.client_id = m.client_id AND n.tenant_id = m.tenant_id AND n.country_id = m.country_id), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.depot_lifting_director_sign(_id uuid, _png text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); be depot_lifting_orders; who text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO be FROM depot_lifting_orders WHERE id = _id FOR UPDATE;
  IF be.id IS NULL THEN RAISE EXCEPTION 'Bon d''enlèvement introuvable'; END IF;
  IF NOT can_access_tenant_country(uid, be.tenant_id, be.country_id) THEN RAISE EXCEPTION 'Périmètre non autorisé'; END IF;
  IF NOT tenant_write_allowed(be.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT has_permission(uid, 'supplies.validate') THEN RAISE EXCEPTION 'Droit supplies.validate requis (directeur d''exploitation)'; END IF;
  IF be.status <> 'signed' THEN RAISE EXCEPTION 'Le responsable logistique doit signer le BE d''abord'; END IF;
  IF be.director_signed_at IS NOT NULL THEN RAISE EXCEPTION 'Visa du directeur d''exploitation déjà apposé'; END IF;
  IF be.signed_by = uid THEN RAISE EXCEPTION 'Le directeur d''exploitation doit être une autre personne que le responsable logistique'; END IF;
  IF coalesce(_png, '') NOT LIKE 'data:image/png;base64,%' OR length(_png) > 400000 THEN RAISE EXCEPTION 'Signature manuscrite obligatoire'; END IF;
  SELECT full_name INTO who FROM profiles WHERE user_id = uid;
  UPDATE depot_lifting_orders SET director_signature_png = _png, director_signed_by = uid, director_signed_by_name = who, director_signed_at = now() WHERE id = be.id;
  INSERT INTO depot_lifting_events (lifting_id, tenant_id, country_id, action, from_status, to_status, author_id, author_name)
  VALUES (be.id, be.tenant_id, be.country_id, 'director_signed', 'signed', 'signed', uid, who);
  RETURN be.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.depot_lifting_director_sign(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.depot_lifting_director_sign(uuid, text) TO authenticated;

UPDATE public.logistics_delivery_notes n SET shipper_user = be.signed_by
FROM public.depot_lifting_orders be
WHERE be.id = n.lifting_id AND be.signature_png IS NOT NULL AND be.signed_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.logistics_delivery_note_signatures s WHERE s.note_id = n.id)
  AND n.shipper_user IS DISTINCT FROM be.signed_by;
INSERT INTO public.logistics_delivery_note_signatures(note_id, role, signed_by, signer_name, signature_png, decision, signed_at)
SELECT n.id, 'shipper', be.signed_by, coalesce(be.signed_by_name, 'Responsable logistique'), be.signature_png, 'signed', coalesce(be.signed_at, now())
FROM public.logistics_delivery_notes n JOIN public.depot_lifting_orders be ON be.id = n.lifting_id
WHERE be.signature_png IS NOT NULL AND be.signed_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.logistics_delivery_note_signatures s WHERE s.note_id = n.id AND s.role = 'shipper');