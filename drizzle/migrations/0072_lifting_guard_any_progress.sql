CREATE OR REPLACE FUNCTION public.logistics_trip_load_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tot numeric; pending int; dlv numeric; be record;
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'Transport annulé : aucune reprise possible'; END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND COALESCE(current_setting('lumatek.be_write', true), '') <> '1' THEN
    RAISE EXCEPTION 'Annulation uniquement via le bon d''enlèvement'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('planned','incident','cancelled') THEN
    SELECT number, status INTO be FROM public.depot_lifting_orders WHERE trip_id = NEW.id;
    IF FOUND AND be.status <> 'signed' THEN RAISE EXCEPTION 'Bon d''enlèvement % non signé : chargement impossible', be.number; END IF;
  END IF;
  IF NEW.status = 'loaded' AND OLD.status = 'loading' THEN
    SELECT sum(qty_litres) INTO tot FROM public.logistics_trip_loads WHERE trip_id = NEW.id;
    IF tot IS NULL THEN RAISE EXCEPTION 'Plan de chargement requis (volume total, produits, destinations)'; END IF;
    NEW.qty_loaded := tot;
  END IF;
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND EXISTS (SELECT 1 FROM public.logistics_trip_loads WHERE trip_id = NEW.id) THEN
    SELECT count(*) INTO pending FROM public.logistics_trip_loads t WHERE t.trip_id = NEW.id
      AND NOT EXISTS (SELECT 1 FROM public.logistics_load_deliveries x WHERE x.load_id = t.id);
    IF pending > 0 THEN RAISE EXCEPTION 'Livraison impossible : % compartiment(s) non validé(s) sur site', pending; END IF;
    SELECT sum(qty_delivered) INTO dlv FROM public.logistics_load_deliveries WHERE trip_id = NEW.id;
    NEW.qty_delivered := dlv;
  END IF;
  RETURN NEW;
END $function$;