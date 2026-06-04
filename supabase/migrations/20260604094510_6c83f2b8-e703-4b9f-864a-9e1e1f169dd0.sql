ALTER TABLE public.depotages
  ADD CONSTRAINT depotages_station_id_fkey
  FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE CASCADE;

ALTER TABLE public.depotages
  ADD CONSTRAINT depotages_tank_id_fkey
  FOREIGN KEY (tank_id) REFERENCES public.tanks(id) ON DELETE SET NULL;