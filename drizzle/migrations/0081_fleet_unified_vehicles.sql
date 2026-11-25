ALTER TABLE public.logistics_vehicles DROP CONSTRAINT logistics_vehicles_kind_check;
ALTER TABLE public.logistics_vehicles ADD CONSTRAINT logistics_vehicles_kind_check CHECK (kind = ANY (ARRAY['truck','tractor','tanker','semi_trailer','trailer']));
ALTER TABLE public.logistics_vehicles ADD COLUMN IF NOT EXISTS default_driver_id uuid REFERENCES public.logistics_drivers(id);
ALTER TABLE public.logistics_vehicles ADD COLUMN IF NOT EXISTS default_trailer_id uuid REFERENCES public.logistics_vehicles(id);
CREATE OR REPLACE FUNCTION public.logistics_vehicle_link_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.default_driver_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM logistics_drivers WHERE id=NEW.default_driver_id AND tenant_id=NEW.tenant_id AND country_id=NEW.country_id) THEN
    RAISE EXCEPTION 'Chauffeur hors périmètre';
  END IF;
  IF NEW.default_trailer_id IS NOT NULL THEN
    IF NEW.default_trailer_id = NEW.id OR NOT EXISTS (SELECT 1 FROM logistics_vehicles WHERE id=NEW.default_trailer_id AND tenant_id=NEW.tenant_id AND country_id=NEW.country_id AND kind IN ('tanker','semi_trailer','trailer')) THEN
      RAISE EXCEPTION 'Remorque / citerne invalide';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS logistics_vehicle_link_guard ON public.logistics_vehicles;
CREATE TRIGGER logistics_vehicle_link_guard BEFORE INSERT OR UPDATE ON public.logistics_vehicles FOR EACH ROW EXECUTE FUNCTION public.logistics_vehicle_link_guard();
REVOKE EXECUTE ON FUNCTION public.logistics_vehicle_link_guard() FROM PUBLIC, anon, authenticated;