CREATE SEQUENCE public.logistics_bl_number_seq;
CREATE TABLE public.logistics_delivery_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), country_id uuid NOT NULL REFERENCES public.countries(id), trip_id uuid NOT NULL REFERENCES public.logistics_trips(id), lifting_id uuid REFERENCES public.depot_lifting_orders(id), number text NOT NULL UNIQUE DEFAULT ('BL-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.logistics_bl_number_seq')::text,6,'0')), site_key text NOT NULL, station_id uuid REFERENCES public.stations(id), client_id uuid REFERENCES public.clients(id), snapshot jsonb NOT NULL, shipper_user uuid, carrier_user uuid, consignee_user uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,site_key)
);
GRANT SELECT ON public.logistics_delivery_notes TO authenticated; GRANT ALL ON public.logistics_delivery_notes TO service_role;
ALTER TABLE public.logistics_delivery_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped BL read" ON public.logistics_delivery_notes FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(),tenant_id,country_id) AND (public.has_permission(auth.uid(),'supplies.view') OR public.is_platform_admin(auth.uid())));
CREATE TABLE public.logistics_delivery_note_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid NOT NULL REFERENCES public.logistics_delivery_notes(id), role text NOT NULL CHECK(role IN ('shipper','carrier','consignee')), signed_by uuid NOT NULL, signer_name text NOT NULL, signature_png text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now(), decision text NOT NULL CHECK(decision IN ('signed','accepted','accepted_with_reserves','refused')), reserves text, UNIQUE(note_id,role)
);
GRANT SELECT ON public.logistics_delivery_note_signatures TO authenticated; GRANT ALL ON public.logistics_delivery_note_signatures TO service_role;
ALTER TABLE public.logistics_delivery_note_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped BL signature read" ON public.logistics_delivery_note_signatures FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.logistics_delivery_notes n WHERE n.id=note_id));
CREATE TABLE public.logistics_delivery_note_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note_id uuid NOT NULL REFERENCES public.logistics_delivery_notes(id), action text NOT NULL, actor uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.logistics_delivery_note_events TO authenticated; GRANT ALL ON public.logistics_delivery_note_events TO service_role;
ALTER TABLE public.logistics_delivery_note_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped BL history read" ON public.logistics_delivery_note_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.logistics_delivery_notes n WHERE n.id=note_id));
CREATE TRIGGER bl_signature_immutable BEFORE UPDATE OR DELETE ON public.logistics_delivery_note_signatures FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE TRIGGER bl_event_immutable BEFORE UPDATE OR DELETE ON public.logistics_delivery_note_events FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE FUNCTION public.logistics_bl_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bon de livraison non supprimable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['shipper_user','carrier_user','consignee_user']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['shipper_user','carrier_user','consignee_user']) OR EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=OLD.id) THEN RAISE EXCEPTION 'Bon de livraison figé'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER bl_lock BEFORE UPDATE OR DELETE ON public.logistics_delivery_notes FOR EACH ROW EXECUTE FUNCTION public.logistics_bl_lock();
CREATE FUNCTION public.logistics_bl_generate_internal(_trip uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t logistics_trips; dest record; sid uuid; bid uuid; cnt integer:=0; content jsonb; identity jsonb;
BEGIN
 SELECT * INTO t FROM logistics_trips WHERE id=_trip FOR UPDATE;
 IF NOT FOUND OR t.loaded_at IS NULL OR t.status IN ('planned','loading','cancelled') THEN RETURN 0; END IF;
 SELECT id INTO bid FROM depot_lifting_orders WHERE trip_id=t.id AND status='signed';
 SELECT jsonb_build_object('tenantId',te.id,'companyName',te.name,'legalName',coalesce(nullif(tc.legal_name,''),te.legal_name,te.name),'logoUrl',te.logo_url,'primaryColor',te.primary_color,'secondaryColor',te.secondary_color,'countryName',c.name,'address',coalesce(tc.address,te.address),'phone',coalesce(tc.phone,te.phone),'email',coalesce(tc.email,te.email),'website',te.website,'taxId',coalesce(tc.tax_id,te.tax_id),'bankDetails',coalesce(tc.bank_details,te.bank_details),'currency',coalesce(tc.currency,te.currency),'language',te.language,'appDescription',te.app_description,'poweredBy',CASE WHEN te.show_powered_by THEN te.powered_by_label ELSE null END) INTO identity FROM tenants te JOIN countries c ON c.id=t.country_id LEFT JOIN tenant_countries tc ON tc.tenant_id=te.id AND tc.country_id=t.country_id WHERE te.id=t.tenant_id;
 FOR dest IN SELECT DISTINCT destination_type,station_id,client_id FROM logistics_trip_loads WHERE trip_id=t.id LOOP
 SELECT jsonb_build_object('site',coalesce(st.name,cl.name),'trip',t.reference,'be',(SELECT number FROM depot_lifting_orders WHERE id=bid),'truck',(SELECT registration FROM logistics_vehicles WHERE id=t.truck_id),'tanker',(SELECT registration FROM logistics_vehicles WHERE id=t.tanker_id),'driver',(SELECT full_name FROM logistics_drivers WHERE id=t.driver_id),'license',(SELECT license_number FROM logistics_drivers WHERE id=t.driver_id),'loaded_at',t.loaded_at,'brand',identity,'seals',coalesce((SELECT jsonb_agg(serial ORDER BY serial) FROM logistics_seals WHERE trip_id=t.id),'[]'::jsonb),'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('load_id',l.id,'product',p.name,'compartment',cp.position,'litres',l.qty_litres) ORDER BY l.stop_order,cp.position) FROM logistics_trip_loads l JOIN petroleum_products p ON p.id=l.product_id LEFT JOIN logistics_compartments cp ON cp.id=l.compartment_id WHERE l.trip_id=t.id AND l.station_id IS NOT DISTINCT FROM dest.station_id AND l.client_id IS NOT DISTINCT FROM dest.client_id),'[]'::jsonb)) INTO content FROM (SELECT 1) dummy LEFT JOIN stations st ON st.id=dest.station_id LEFT JOIN clients cl ON cl.id=dest.client_id;
 sid:=null;
 INSERT INTO logistics_delivery_notes(tenant_id,country_id,trip_id,lifting_id,site_key,station_id,client_id,snapshot) VALUES(t.tenant_id,t.country_id,t.id,bid,dest.destination_type||':'||coalesce(dest.station_id,dest.client_id)::text,dest.station_id,dest.client_id,content) ON CONFLICT(trip_id,site_key) DO NOTHING RETURNING id INTO sid;
 IF sid IS NOT NULL THEN cnt:=cnt+1; INSERT INTO logistics_delivery_note_events(note_id,action,actor) VALUES(sid,'generated',auth.uid()); END IF;
 END LOOP;
 RETURN cnt; END $$;
REVOKE ALL ON FUNCTION public.logistics_bl_generate_internal(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.logistics_bl_after_loaded() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.status='loaded' AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM logistics_bl_generate_internal(NEW.id); END IF; RETURN NEW; END $$;
CREATE TRIGGER bl_after_loaded AFTER UPDATE OF status ON public.logistics_trips FOR EACH ROW EXECUTE FUNCTION public.logistics_bl_after_loaded();
CREATE FUNCTION public.logistics_bl_action(_action text,_id uuid,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n logistics_delivery_notes; t logistics_trips; uid uuid:=auth.uid(); r text; assigned uuid; nm text; dec text; a uuid; b uuid; c uuid; x uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
 IF _action='generate' THEN
 SELECT * INTO t FROM logistics_trips WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT can_access_tenant_country(uid,t.tenant_id,t.country_id) OR NOT (has_permission(uid,'supplies.validate') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT tenant_write_allowed(t.tenant_id) OR NOT is_module_enabled(t.tenant_id,t.country_id,'logistique_avancee') THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
 RETURN jsonb_build_object('generated',logistics_bl_generate_internal(_id)); END IF;
 SELECT * INTO n FROM logistics_delivery_notes WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bon introuvable'; END IF;
 SELECT * INTO t FROM logistics_trips WHERE id=n.trip_id;
 IF t.status='cancelled' THEN RAISE EXCEPTION 'Transport annulé'; END IF;
 IF NOT tenant_write_allowed(n.tenant_id) OR NOT is_module_enabled(n.tenant_id,n.country_id,'logistique_avancee') THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
 IF _action='assign' THEN
 IF NOT can_access_tenant_country(uid,n.tenant_id,n.country_id) OR NOT(has_permission(uid,'supplies.validate') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
 a:=(_data->>'shipper')::uuid; b:=(_data->>'carrier')::uuid; c:=(_data->>'consignee')::uuid;
 IF a IS NULL OR b IS NULL OR c IS NULL OR a=b OR a=c OR b=c THEN RAISE EXCEPTION 'Trois comptes distincts requis'; END IF;
 FOREACH x IN ARRAY ARRAY[a,b] LOOP
 IF NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=x AND p.tenant_id=n.tenant_id AND p.is_active) OR EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=x) OR NOT can_access_tenant_country(x,n.tenant_id,n.country_id) THEN RAISE EXCEPTION 'Compte logistique/chauffeur hors périmètre'; END IF;
 END LOOP;
 IF NOT (EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=c AND p.tenant_id=n.tenant_id AND p.is_active) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=c) AND can_access_tenant_country(c,n.tenant_id,n.country_id) AND (n.station_id IS NULL OR EXISTS(SELECT 1 FROM station_assignments WHERE user_id=c AND station_id=n.station_id))) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users bp WHERE bp.user_id=c AND bp.active AND bp.can_manage AND bp.tenant_id=n.tenant_id AND bp.country_id=n.country_id AND bp.client_id=n.client_id) THEN RAISE EXCEPTION 'Destinataire non habilité pour ce site'; END IF;
 UPDATE logistics_delivery_notes SET shipper_user=a,carrier_user=b,consignee_user=c WHERE id=n.id;
 INSERT INTO logistics_delivery_note_events(note_id,action,actor,details) VALUES(n.id,'assigned',uid,jsonb_build_object('shipper',a,'carrier',b,'consignee',c));
 ELSE
 IF _action<>'sign' THEN RAISE EXCEPTION 'Action inconnue'; END IF;
 r:=_data->>'role'; assigned:=CASE r WHEN 'shipper' THEN n.shipper_user WHEN 'carrier' THEN n.carrier_user WHEN 'consignee' THEN n.consignee_user ELSE null END;
 IF assigned IS NULL OR assigned<>uid THEN RAISE EXCEPTION 'Seul le signataire désigné peut signer avec son propre compte'; END IF;
 IF NOT (can_access_tenant_country(uid,n.tenant_id,n.country_id) AND EXISTS(SELECT 1 FROM profiles WHERE user_id=uid AND is_active) AND NOT EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid)) AND NOT(r='consignee' AND EXISTS(SELECT 1 FROM b2b_portal_users WHERE user_id=uid AND active AND can_manage AND client_id=n.client_id AND tenant_id=n.tenant_id AND country_id=n.country_id)) THEN RAISE EXCEPTION 'Compte non habilité'; END IF;
 IF r='carrier' AND NOT EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=n.id AND role='shipper') OR r='consignee' AND NOT EXISTS(SELECT 1 FROM logistics_delivery_note_signatures WHERE note_id=n.id AND role='carrier') THEN RAISE EXCEPTION 'Signature précédente requise'; END IF;
 IF r='shipper' AND t.departed_at IS NOT NULL OR r='carrier' AND t.departed_at IS NOT NULL THEN RAISE EXCEPTION 'Signature de départ trop tardive'; END IF;
 IF r='consignee' AND (t.status NOT IN ('arrived','unloading','delivered') OR EXISTS(SELECT 1 FROM jsonb_array_elements(n.snapshot->'lines') l WHERE NOT EXISTS(SELECT 1 FROM logistics_load_deliveries d WHERE d.load_id=(l->>'load_id')::uuid))) THEN RAISE EXCEPTION 'Confirmez d’abord la livraison de ce site'; END IF;
 IF coalesce(_data->>'png','') NOT LIKE 'data:image/png;base64,%' OR length(_data->>'png') NOT BETWEEN 200 AND 400000 THEN RAISE EXCEPTION 'Signature invalide'; END IF;
 dec:=CASE WHEN r='consignee' THEN _data->>'decision' ELSE 'signed' END;
 IF dec IS NULL OR (r='consignee' AND dec NOT IN ('accepted','accepted_with_reserves','refused')) THEN RAISE EXCEPTION 'Décision invalide'; END IF;
 IF dec IN ('accepted_with_reserves','refused') AND length(trim(coalesce(_data->>'reserves','')))<3 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
 SELECT coalesce((SELECT full_name FROM b2b_portal_users WHERE user_id=uid AND active),(SELECT full_name FROM profiles WHERE user_id=uid)) INTO nm;
 IF length(trim(coalesce(nm,'')))<2 THEN RAISE EXCEPTION 'Nom du compte requis'; END IF;
 INSERT INTO logistics_delivery_note_signatures(note_id,role,signed_by,signer_name,signature_png,decision,reserves) VALUES(n.id,r,uid,nm,_data->>'png',dec,nullif(trim(_data->>'reserves'),''));
 INSERT INTO logistics_delivery_note_events(note_id,action,actor,details) VALUES(n.id,'signed',uid,jsonb_build_object('role',r,'decision',dec));
 END IF;
 RETURN jsonb_build_object('id',n.id);
END $$;
REVOKE ALL ON FUNCTION public.logistics_bl_action(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.logistics_bl_action(text,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.logistics_bl_overview(_tenant uuid DEFAULT NULL,_country uuid DEFAULT NULL,_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); bp b2b_portal_users; result jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
 SELECT * INTO bp FROM b2b_portal_users WHERE user_id=uid AND active;
 IF bp.user_id IS NOT NULL THEN _tenant:=bp.tenant_id; _country:=bp.country_id;
 ELSIF _tenant IS NULL OR _country IS NULL OR NOT can_access_tenant_country(uid,_tenant,_country) OR NOT(has_permission(uid,'supplies.view') OR is_platform_admin(uid)) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF NOT is_module_enabled(_tenant,_country,'logistique_avancee') THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO result FROM (
 SELECT to_jsonb(n)||jsonb_build_object('trip_status',t.status,'signatures',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY signed_at) FROM logistics_delivery_note_signatures s WHERE s.note_id=n.id),'[]'::jsonb),'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY created_at) FROM logistics_delivery_note_events e WHERE e.note_id=n.id),'[]'::jsonb)) item FROM logistics_delivery_notes n JOIN logistics_trips t ON t.id=n.trip_id WHERE n.tenant_id=_tenant AND n.country_id=_country AND (bp.user_id IS NULL OR (n.client_id=bp.client_id AND n.consignee_user=uid)) ORDER BY n.created_at DESC,n.id LIMIT 100 OFFSET greatest(0,_offset)) rows;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.logistics_bl_overview(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.logistics_bl_overview(uuid,uuid,integer) TO authenticated;