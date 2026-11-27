ALTER TABLE public.logistics_discharges ADD COLUMN IF NOT EXISTS discharge_date date;
DROP FUNCTION IF EXISTS public.logistics_discharge(uuid, uuid, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.logistics_discharge(_load uuid, _tank uuid, _before numeric, _after numeric, _note text DEFAULT NULL::text, _date date DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l record; t record; tk record; uid uuid := auth.uid(); mv uuid; did uuid; book boolean; pending int; d date := coalesce(_date, current_date);
BEGIN
  IF d > current_date THEN RAISE EXCEPTION 'Date de dépotage future interdite'; END IF;
  SELECT * INTO l FROM logistics_trip_loads WHERE id = _load;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compartiment introuvable'; END IF;
  SELECT * INTO t FROM logistics_trips WHERE id = l.trip_id FOR UPDATE;
  IF NOT can_access_tenant_country(uid, t.tenant_id, t.country_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid, 'supplies.validate') OR has_permission(uid, 'depotages.create')) THEN RAISE EXCEPTION 'Droit dépotage requis'; END IF;
  IF NOT (is_module_enabled(t.tenant_id,t.country_id,'logistique') OR is_module_enabled(t.tenant_id,t.country_id,'logistique_avancee')) THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
  IF l.destination_type <> 'station' OR l.station_id IS NULL THEN RAISE EXCEPTION 'Dépotage réservé aux compartiments livrés à une station'; END IF;
  IF NOT station_in_my_scope(l.station_id) THEN RAISE EXCEPTION 'Station hors de votre périmètre'; END IF;
  IF EXISTS (SELECT 1 FROM logistics_discharges WHERE load_id = _load) THEN RAISE EXCEPTION 'Compartiment déjà dépoté'; END IF;
  SELECT * INTO tk FROM tanks WHERE id = _tank;
  IF NOT FOUND OR tk.station_id <> l.station_id THEN RAISE EXCEPTION 'La cuve n''appartient pas à la station livrée'; END IF;
  IF tk.product_id IS NOT NULL AND tk.product_id <> l.product_id THEN RAISE EXCEPTION 'Produit du compartiment différent du produit de la cuve'; END IF;
  IF _before IS NULL OR _after IS NULL OR _before < 0 OR _after < _before THEN RAISE EXCEPTION 'Jauges invalides (après ≥ avant ≥ 0)'; END IF;
  IF tk.capacity_liters IS NOT NULL AND _after > tk.capacity_liters THEN RAISE EXCEPTION 'Jauge après supérieure à la capacité de la cuve'; END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_load_deliveries WHERE load_id = _load) THEN
    IF t.status NOT IN ('arrived','unloading') THEN RAISE EXCEPTION 'Le camion doit être arrivé à la station'; END IF;
    INSERT INTO logistics_load_deliveries(tenant_id,country_id,trip_id,load_id,qty_delivered,note,author_id)
    VALUES (t.tenant_id,t.country_id,t.id,_load,l.qty_litres,'Livraison confirmée par le dépotage',uid);
    IF t.status = 'arrived' THEN UPDATE logistics_trips SET status='unloading', unloading_started_at=now() WHERE id=t.id; END IF;
  END IF;
  book := t.supply_request_id IS NULL;
  IF book THEN
    INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,reason,reference,movement_date)
    VALUES (t.tenant_id,t.country_id,'station',l.station_id,_tank,l.product_id,'entry',l.qty_litres,'Dépotage compartiment (volume BL)',t.reference,
      CASE WHEN d = current_date THEN now() ELSE (d::timestamp + time '12:00') END)
    RETURNING id INTO mv;
  END IF;
  INSERT INTO logistics_discharges(tenant_id,country_id,trip_id,load_id,station_id,tank_id,product_id,qty_bl,gauge_before,gauge_after,stock_booked,stock_movement_id,note,author_id,discharge_date)
  VALUES (t.tenant_id,t.country_id,t.id,_load,l.station_id,_tank,l.product_id,l.qty_litres,_before,_after,book,mv,nullif(btrim(_note),''),uid,d)
  RETURNING id INTO did;
  INSERT INTO logistics_trip_events(tenant_id,country_id,trip_id,action,from_status,to_status,reason,author_id)
  VALUES (t.tenant_id,t.country_id,t.id,'discharge',t.status,t.status,format('Cuve %s : BL %s L, jaugé %s L, date %s', tk.name, l.qty_litres, _after-_before, to_char(d,'DD/MM/YYYY')),uid);
  SELECT count(*) INTO pending FROM logistics_trip_loads x WHERE x.trip_id=t.id AND NOT EXISTS (SELECT 1 FROM logistics_load_deliveries y WHERE y.load_id=x.id);
  IF pending = 0 AND t.status IN ('arrived','unloading') THEN
    BEGIN
      UPDATE logistics_trips SET status='delivered', delivered_at=now() WHERE id=t.id;
      INSERT INTO logistics_trip_events(trip_id,tenant_id,country_id,action,from_status,to_status,reason,data,author_id)
      VALUES (t.id,t.tenant_id,t.country_id,'deliver_auto','unloading','delivered','Clôture automatique : tous les compartiments dépotés','{}'::jsonb,uid);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Clôture automatique impossible: %', SQLERRM;
    END;
  END IF;
  RETURN did;
END $function$;
REVOKE EXECUTE ON FUNCTION public.logistics_discharge(uuid,uuid,numeric,numeric,text,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.logistics_discharge(uuid,uuid,numeric,numeric,text,date) TO authenticated, service_role;