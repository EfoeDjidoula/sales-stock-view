CREATE TABLE public.logistics_discharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.logistics_trips(id),
  load_id uuid NOT NULL UNIQUE REFERENCES public.logistics_trip_loads(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  tank_id uuid NOT NULL REFERENCES public.tanks(id),
  product_id uuid NOT NULL,
  qty_bl numeric NOT NULL CHECK (qty_bl > 0),
  gauge_before numeric NOT NULL CHECK (gauge_before >= 0),
  gauge_after numeric NOT NULL CHECK (gauge_after >= gauge_before),
  qty_measured numeric GENERATED ALWAYS AS (gauge_after - gauge_before) STORED,
  variance numeric GENERATED ALWAYS AS (gauge_after - gauge_before - qty_bl) STORED,
  stock_booked boolean NOT NULL DEFAULT false,
  stock_movement_id uuid,
  note text, author_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.logistics_discharges TO authenticated;
GRANT ALL ON public.logistics_discharges TO service_role;
ALTER TABLE public.logistics_discharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoped read" ON public.logistics_discharges FOR SELECT TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE TRIGGER logistics_discharges_immutable BEFORE UPDATE OR DELETE ON public.logistics_discharges
  FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();

CREATE OR REPLACE FUNCTION public.logistics_discharge(_load uuid, _tank uuid, _before numeric, _after numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; t record; tk record; uid uuid := auth.uid(); mv uuid; did uuid; book boolean;
BEGIN
  SELECT * INTO l FROM logistics_trip_loads WHERE id = _load;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compartiment introuvable'; END IF;
  SELECT * INTO t FROM logistics_trips WHERE id = l.trip_id;
  IF NOT can_access_tenant_country(uid, t.tenant_id, t.country_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid, 'supplies.validate')) THEN RAISE EXCEPTION 'Droit supplies.validate requis'; END IF;
  IF NOT (is_module_enabled(t.tenant_id,t.country_id,'logistique') OR is_module_enabled(t.tenant_id,t.country_id,'logistique_avancee')) THEN RAISE EXCEPTION 'Licence ou module indisponible'; END IF;
  IF l.destination_type <> 'station' OR l.station_id IS NULL THEN RAISE EXCEPTION 'Dépotage réservé aux compartiments livrés à une station'; END IF;
  IF NOT EXISTS (SELECT 1 FROM logistics_load_deliveries WHERE load_id = _load) THEN RAISE EXCEPTION 'Confirmez d''abord la livraison du site'; END IF;
  IF EXISTS (SELECT 1 FROM logistics_discharges WHERE load_id = _load) THEN RAISE EXCEPTION 'Compartiment déjà dépoté'; END IF;
  SELECT * INTO tk FROM tanks WHERE id = _tank;
  IF NOT FOUND OR tk.station_id <> l.station_id THEN RAISE EXCEPTION 'La cuve n''appartient pas à la station livrée'; END IF;
  IF tk.product_id IS NOT NULL AND tk.product_id <> l.product_id THEN RAISE EXCEPTION 'Produit du compartiment différent du produit de la cuve'; END IF;
  IF _before IS NULL OR _after IS NULL OR _before < 0 OR _after < _before THEN RAISE EXCEPTION 'Jauges invalides (après ≥ avant ≥ 0)'; END IF;
  IF tk.capacity_liters IS NOT NULL AND _after > tk.capacity_liters THEN RAISE EXCEPTION 'Jauge après supérieure à la capacité de la cuve'; END IF;
  book := t.supply_request_id IS NULL;
  IF book THEN
    INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,reason,reference,movement_date)
    VALUES (t.tenant_id,t.country_id,'station',l.station_id,_tank,l.product_id,'entry',l.qty_litres,'Dépotage compartiment (volume BL)',t.reference,now())
    RETURNING id INTO mv;
  END IF;
  INSERT INTO logistics_discharges(tenant_id,country_id,trip_id,load_id,station_id,tank_id,product_id,qty_bl,gauge_before,gauge_after,stock_booked,stock_movement_id,note,author_id)
  VALUES (t.tenant_id,t.country_id,t.id,_load,l.station_id,_tank,l.product_id,l.qty_litres,_before,_after,book,mv,nullif(btrim(_note),''),uid)
  RETURNING id INTO did;
  INSERT INTO logistics_trip_events(tenant_id,country_id,trip_id,action,from_status,to_status,reason,author_id)
  VALUES (t.tenant_id,t.country_id,t.id,'discharge',t.status,t.status,format('Cuve %s : BL %s L, jaugé %s L', tk.name, l.qty_litres, _after-_before),uid);
  RETURN did;
END $$;
REVOKE ALL ON FUNCTION public.logistics_discharge(uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.logistics_discharge(uuid,uuid,numeric,numeric,text) TO authenticated;