CREATE OR REPLACE FUNCTION public.logistics_bl_generate_internal(_trip uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t logistics_trips; dest record; sid uuid; bid uuid; cnt integer:=0; content jsonb; identity jsonb;
BEGIN
 SELECT * INTO t FROM logistics_trips WHERE id=_trip FOR UPDATE;
 IF NOT FOUND OR t.loaded_at IS NULL OR t.status IN ('planned','loading','cancelled') THEN RETURN 0; END IF;
 SELECT id INTO bid FROM depot_lifting_orders WHERE trip_id=t.id AND status='signed';
 SELECT jsonb_build_object('tenantId',te.id,'companyName',te.name,'legalName',coalesce(nullif(tc.legal_name,''),te.legal_name,te.name),'logoUrl',te.logo_url,'primaryColor',te.primary_color,'secondaryColor',te.secondary_color,'countryName',c.name,'address',coalesce(tc.address,te.address),'phone',coalesce(tc.phone,te.phone),'email',coalesce(tc.email,te.email),'website',te.website,'taxId',coalesce(tc.tax_id,te.tax_id),'bankDetails',coalesce(tc.bank_details,te.bank_details),'currency',coalesce(tc.currency,te.default_currency),'language',te.default_language,'appDescription',te.app_description,'poweredBy',CASE WHEN te.show_powered_by THEN te.powered_by_label ELSE null END) INTO identity FROM tenants te JOIN countries c ON c.id=t.country_id LEFT JOIN tenant_countries tc ON tc.tenant_id=te.id AND tc.country_id=t.country_id WHERE te.id=t.tenant_id;
 FOR dest IN SELECT DISTINCT destination_type,station_id,client_id FROM logistics_trip_loads WHERE trip_id=t.id LOOP
 SELECT jsonb_build_object('site',coalesce(st.name,cl.name),'trip',t.reference,'be',(SELECT number FROM depot_lifting_orders WHERE id=bid),'truck',(SELECT registration FROM logistics_vehicles WHERE id=t.truck_id),'tanker',(SELECT registration FROM logistics_vehicles WHERE id=t.tanker_id),'driver',(SELECT full_name FROM logistics_drivers WHERE id=t.driver_id),'license',(SELECT license_number FROM logistics_drivers WHERE id=t.driver_id),'loaded_at',t.loaded_at,'brand',identity,'seals',coalesce((SELECT jsonb_agg(serial ORDER BY serial) FROM logistics_seals WHERE trip_id=t.id),'[]'::jsonb),'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('load_id',l.id,'product',p.name,'compartment',cp.position,'litres',l.qty_litres) ORDER BY l.stop_order,cp.position) FROM logistics_trip_loads l JOIN petroleum_products p ON p.id=l.product_id LEFT JOIN logistics_compartments cp ON cp.id=l.compartment_id WHERE l.trip_id=t.id AND l.station_id IS NOT DISTINCT FROM dest.station_id AND l.client_id IS NOT DISTINCT FROM dest.client_id),'[]'::jsonb)) INTO content FROM (SELECT 1) dummy LEFT JOIN stations st ON st.id=dest.station_id LEFT JOIN clients cl ON cl.id=dest.client_id;
 sid:=null;
 INSERT INTO logistics_delivery_notes(tenant_id,country_id,trip_id,lifting_id,site_key,station_id,client_id,snapshot) VALUES(t.tenant_id,t.country_id,t.id,bid,dest.destination_type||':'||coalesce(dest.station_id,dest.client_id)::text,dest.station_id,dest.client_id,content) ON CONFLICT(trip_id,site_key) DO NOTHING RETURNING id INTO sid;
 IF sid IS NOT NULL THEN cnt:=cnt+1; INSERT INTO logistics_delivery_note_events(note_id,action,actor) VALUES(sid,'generated',auth.uid()); END IF;
 END LOOP;
 RETURN cnt; END $function$;
REVOKE ALL ON FUNCTION public.logistics_bl_generate_internal(uuid) FROM PUBLIC,anon,authenticated;