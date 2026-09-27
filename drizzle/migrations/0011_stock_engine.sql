
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS min_threshold numeric CHECK (min_threshold IS NULL OR min_threshold >= 0);
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS critical_threshold numeric CHECK (critical_threshold IS NULL OR critical_threshold >= 0);

CREATE TABLE public.depot_product_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  depot_id uuid NOT NULL REFERENCES public.depots(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  capacity_liters numeric NOT NULL DEFAULT 0 CHECK (capacity_liters >= 0),
  min_threshold numeric CHECK (min_threshold IS NULL OR min_threshold >= 0),
  critical_threshold numeric CHECK (critical_threshold IS NULL OR critical_threshold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (depot_id, product_id)
);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  location_type text NOT NULL CHECK (location_type IN ('station','depot')),
  station_id uuid REFERENCES public.stations(id),
  depot_id uuid REFERENCES public.depots(id),
  tank_id uuid REFERENCES public.tanks(id),
  product_id uuid NOT NULL REFERENCES public.petroleum_products(id),
  movement_type text NOT NULL CHECK (movement_type IN ('initial','entry','exit','sale','transfer_out','transfer_in','adjustment_in','adjustment_out','inventory')),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  physical_level numeric CHECK (physical_level IS NULL OR physical_level >= 0),
  theoretical_at_count numeric,
  reason text,
  reference text,
  transfer_id uuid,
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('pending','validated','rejected')),
  movement_date timestamptz NOT NULL DEFAULT now(),
  requested_by uuid,
  requested_by_name text,
  validated_by uuid,
  validated_at timestamptz,
  validation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((location_type = 'station' AND station_id IS NOT NULL) OR (location_type = 'depot' AND depot_id IS NOT NULL))
);
CREATE INDEX stock_mv_loc ON public.stock_movements (tenant_id, country_id, station_id, depot_id, tank_id, product_id);
CREATE INDEX stock_mv_transfer ON public.stock_movements (transfer_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['depot_product_thresholds','stock_movements'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''stock''))', t);
    EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''stock''))', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''stocks'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''stocks''))', t);
    EXECUTE format('CREATE TRIGGER trg_set_tenant_country BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_country_context()', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''stock'')', t);
  END LOOP;
END $$;
GRANT DELETE ON public.depot_product_thresholds TO authenticated;
CREATE POLICY "Writers delete" ON public.depot_product_thresholds FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), 'stock'));
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.depot_product_thresholds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stock théorique d'un emplacement (mouvements validés uniquement)
CREATE OR REPLACE FUNCTION public.stock_theoretical(_location_type text, _location_id uuid, _tank_id uuid, _product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE
    WHEN movement_type IN ('initial','entry','transfer_in','adjustment_in') THEN quantity
    WHEN movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN -quantity
    ELSE 0 END), 0)
  FROM public.stock_movements
  WHERE status = 'validated' AND product_id = _product_id
    AND ((_location_type = 'station' AND station_id = _location_id) OR (_location_type = 'depot' AND depot_id = _location_id))
    AND (_tank_id IS NULL OR tank_id = _tank_id)
    AND public.can_access_tenant_country(auth.uid(), tenant_id, country_id)
$$;
REVOKE EXECUTE ON FUNCTION public.stock_theoretical(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_theoretical(text, uuid, uuid, uuid) TO authenticated;

-- Registre : contrôle à l'insertion, immuable ensuite (seule la validation d'un mouvement en attente est permise)
CREATE OR REPLACE FUNCTION public.stock_movement_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  is_validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid, 'stock.validate');
  loc uuid;
  avail numeric;
  tk record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('validated','rejected') THEN
      RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
    END IF;
    IF NOT is_validator THEN
      RAISE EXCEPTION 'Validation réservée aux utilisateurs autorisés (stock.validate)';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','validated_by','validated_at','validation_note'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','validated_by','validated_at','validation_note']) THEN
      RAISE EXCEPTION 'Seul le statut de validation peut être modifié';
    END IF;
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.status = 'validated' AND NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN
      loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
      avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);
      IF NEW.quantity > avail THEN
        RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  NEW.requested_by := uid;
  NEW.requested_by_name := (SELECT full_name FROM public.profiles WHERE user_id = uid);
  NEW.created_at := now();
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour un ajustement ou un inventaire';
  END IF;
  IF NEW.movement_type = 'inventory' AND NEW.physical_level IS NULL THEN
    RAISE EXCEPTION 'Le niveau physique mesuré est obligatoire pour un inventaire';
  END IF;
  IF NEW.movement_type <> 'inventory' AND NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être strictement positive';
  END IF;

  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id, product_id, capacity_liters INTO tk FROM public.tanks WHERE id = NEW.tank_id;
    IF NEW.location_type <> 'station' OR tk.station_id IS DISTINCT FROM NEW.station_id THEN
      RAISE EXCEPTION 'La cuve n''appartient pas à cette station';
    END IF;
    IF tk.product_id IS NOT NULL AND tk.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au produit de la cuve';
    END IF;
  END IF;

  loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
  avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);

  IF NEW.movement_type = 'inventory' THEN
    NEW.theoretical_at_count := avail;
    NEW.quantity := 0;
  END IF;

  -- Ajustements et inventaires : en attente sauf pour un valideur
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') THEN
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSIF NEW.movement_type = 'initial' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE movement_type = 'initial' AND status <> 'rejected'
               AND product_id = NEW.product_id AND tank_id IS NOT DISTINCT FROM NEW.tank_id
               AND station_id IS NOT DISTINCT FROM NEW.station_id AND depot_id IS NOT DISTINCT FROM NEW.depot_id) THEN
      RAISE EXCEPTION 'Un stock initial existe déjà : utilisez un ajustement';
    END IF;
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSE
    NEW.status := 'validated';
  END IF;

  IF NEW.status = 'validated' THEN
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') AND NEW.quantity > avail THEN
      RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
    END IF;
    IF NEW.movement_type IN ('entry','transfer_in','initial','adjustment_in') AND tk.capacity_liters IS NOT NULL
       AND avail + NEW.quantity > tk.capacity_liters THEN
      RAISE EXCEPTION 'Capacité de la cuve dépassée (% L)', tk.capacity_liters;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.stock_movement_before() FROM PUBLIC, anon;
CREATE TRIGGER trg_stock_movement_before BEFORE INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movement_before();

-- Transferts : deux mouvements liés, atomiques
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  _from_type text, _from_id uuid, _from_tank uuid,
  _to_type text, _to_id uuid, _to_tank uuid,
  _product_id uuid, _quantity numeric, _reason text, _reference text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE tid uuid := gen_random_uuid(); fc uuid; tc uuid; tn uuid;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
  IF _from_type = _to_type AND _from_id = _to_id AND _from_tank IS NOT DISTINCT FROM _to_tank THEN
    RAISE EXCEPTION 'Origine et destination identiques';
  END IF;
  IF _from_type = 'station' AND _to_type = 'depot' THEN
    RAISE EXCEPTION 'Transfert station → dépôt non autorisé';
  END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR public.has_permission(auth.uid(), 'stock.create') OR public.has_permission(auth.uid(), 'stock.validate')) THEN
    RAISE EXCEPTION 'Permission insuffisante pour un transfert';
  END IF;
  IF _from_type = 'station' THEN SELECT tenant_id, country_id INTO tn, fc FROM public.stations WHERE id = _from_id;
  ELSE SELECT tenant_id, country_id INTO tn, fc FROM public.depots WHERE id = _from_id; END IF;
  IF _to_type = 'station' THEN SELECT country_id INTO tc FROM public.stations WHERE id = _to_id AND tenant_id = tn;
  ELSE SELECT country_id INTO tc FROM public.depots WHERE id = _to_id AND tenant_id = tn; END IF;
  IF tc IS NULL OR tc IS DISTINCT FROM fc THEN
    RAISE EXCEPTION 'Transfert limité à la même société et au même pays';
  END IF;

  INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, depot_id, tank_id, product_id, movement_type, quantity, reason, reference, transfer_id)
  VALUES (tn, fc, _from_type, CASE WHEN _from_type='station' THEN _from_id END, CASE WHEN _from_type='depot' THEN _from_id END, _from_tank, _product_id, 'transfer_out', _quantity, _reason, _reference, tid);
  INSERT INTO public.stock_movements (tenant_id, country_id, location_type, station_id, depot_id, tank_id, product_id, movement_type, quantity, reason, reference, transfer_id)
  VALUES (tn, tc, _to_type, CASE WHEN _to_type='station' THEN _to_id END, CASE WHEN _to_type='depot' THEN _to_id END, _to_tank, _product_id, 'transfer_in', _quantity, _reason, _reference, tid);
  RETURN tid;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_stock_transfer(text,uuid,uuid,text,uuid,uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(text,uuid,uuid,text,uuid,uuid,uuid,numeric,text,text) TO authenticated;

-- Niveaux de stock consolidés (RLS appliquée via security_invoker)
CREATE VIEW public.stock_levels WITH (security_invoker = true) AS
WITH mv AS (
  SELECT tenant_id, country_id, location_type, station_id, depot_id, tank_id, product_id,
    SUM(CASE WHEN movement_type='initial' THEN quantity ELSE 0 END) AS initial_qty,
    SUM(CASE WHEN movement_type IN ('entry','transfer_in','adjustment_in') THEN quantity ELSE 0 END) AS entries,
    SUM(CASE WHEN movement_type IN ('exit','transfer_out','adjustment_out') THEN quantity ELSE 0 END) AS exits,
    SUM(CASE WHEN movement_type='sale' THEN quantity ELSE 0 END) AS sales
  FROM public.stock_movements WHERE status = 'validated'
  GROUP BY 1,2,3,4,5,6,7
), inv AS (
  SELECT DISTINCT ON (station_id, depot_id, tank_id, product_id)
    station_id, depot_id, tank_id, product_id, physical_level, movement_date AS counted_at
  FROM public.stock_movements WHERE movement_type='inventory' AND status='validated'
  ORDER BY station_id, depot_id, tank_id, product_id, movement_date DESC
)
SELECT mv.*,
  mv.initial_qty + mv.entries - mv.exits - mv.sales AS theoretical,
  inv.physical_level AS physical, inv.counted_at,
  CASE WHEN inv.physical_level IS NULL THEN NULL ELSE inv.physical_level - (mv.initial_qty + mv.entries - mv.exits - mv.sales) END AS variance,
  COALESCE(t.capacity_liters, d.capacity_liters) AS capacity,
  COALESCE(t.min_threshold, d.min_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.25) AS min_threshold,
  COALESCE(t.critical_threshold, d.critical_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.10) AS critical_threshold,
  CASE
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= 0 THEN 'rupture'
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= COALESCE(t.critical_threshold, d.critical_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.10, 0) THEN 'critique'
    WHEN mv.initial_qty + mv.entries - mv.exits - mv.sales <= COALESCE(t.min_threshold, d.min_threshold, COALESCE(t.capacity_liters, d.capacity_liters) * 0.25, 0) THEN 'faible'
    ELSE 'normal' END AS alert_level
FROM mv
LEFT JOIN inv ON inv.station_id IS NOT DISTINCT FROM mv.station_id AND inv.depot_id IS NOT DISTINCT FROM mv.depot_id
  AND inv.tank_id IS NOT DISTINCT FROM mv.tank_id AND inv.product_id = mv.product_id
LEFT JOIN public.tanks t ON t.id = mv.tank_id
LEFT JOIN public.depot_product_thresholds d ON d.depot_id = mv.depot_id AND d.product_id = mv.product_id;
GRANT SELECT ON public.stock_levels TO authenticated;
