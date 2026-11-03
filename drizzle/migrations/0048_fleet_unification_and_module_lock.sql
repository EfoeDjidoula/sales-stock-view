DROP POLICY IF EXISTS "Admins can delete tenant modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Admins can insert tenant modules" ON public.tenant_modules;
DROP POLICY IF EXISTS "Admins can update tenant modules" ON public.tenant_modules;
CREATE POLICY "Platform admins insert tenant modules" ON public.tenant_modules FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins update tenant modules" ON public.tenant_modules FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins delete tenant modules" ON public.tenant_modules FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));

ALTER TABLE public.supply_requests ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.logistics_vehicles(id);
ALTER TABLE public.depotages ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.logistics_vehicles(id);
COMMENT ON COLUMN public.supply_requests.truck_id IS 'DEPRECATED: replaced by vehicle_id (logistics_vehicles)';
COMMENT ON COLUMN public.depotages.truck_id IS 'DEPRECATED: replaced by vehicle_id (logistics_vehicles)';
COMMENT ON TABLE public.trucks IS 'DEPRECATED: replaced by logistics_vehicles';

CREATE OR REPLACE FUNCTION public.map_fleet_vehicle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  IF NEW.truck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM trucks WHERE id = NEW.truck_id) THEN
    SELECT * INTO v FROM logistics_vehicles WHERE id = NEW.truck_id;
    IF FOUND THEN NEW.vehicle_id := v.id; NEW.truck_id := v.legacy_truck_id; END IF;
  ELSIF NEW.truck_id IS NOT NULL AND NEW.vehicle_id IS NULL THEN
    SELECT id INTO NEW.vehicle_id FROM logistics_vehicles WHERE legacy_truck_id = NEW.truck_id LIMIT 1;
  END IF;
  IF NEW.vehicle_id IS NOT NULL THEN
    SELECT * INTO v FROM logistics_vehicles WHERE id = NEW.vehicle_id;
    IF v.tenant_id IS DISTINCT FROM NEW.tenant_id OR v.country_id IS DISTINCT FROM NEW.country_id THEN
      RAISE EXCEPTION 'Véhicule hors périmètre société/pays';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_map_fleet_vehicle ON public.supply_requests;
CREATE TRIGGER a_map_fleet_vehicle BEFORE INSERT OR UPDATE ON public.supply_requests FOR EACH ROW EXECUTE FUNCTION public.map_fleet_vehicle();
DROP TRIGGER IF EXISTS a_map_fleet_vehicle ON public.depotages;
CREATE TRIGGER a_map_fleet_vehicle BEFORE INSERT OR UPDATE ON public.depotages FOR EACH ROW EXECUTE FUNCTION public.map_fleet_vehicle();