
CREATE TABLE public.maintenance_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  location_type text NOT NULL DEFAULT 'station' CHECK (location_type IN ('station','depot')),
  station_id uuid REFERENCES public.stations(id),
  depot_id uuid REFERENCES public.depots(id),
  category text NOT NULL CHECK (category IN ('tank','pump','nozzle','generator','compressor','tpe','atg','extinguisher','other')),
  custom_category text,
  asset_number text NOT NULL,
  model text, manufacturer text, serial_number text,
  installed_on date, warranty_until date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','down','retired')),
  location_detail text, notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, asset_number),
  CHECK ((location_type='station' AND station_id IS NOT NULL) OR (location_type='depot' AND depot_id IS NOT NULL))
);
CREATE TABLE public.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  asset_id uuid NOT NULL REFERENCES public.maintenance_assets(id),
  title text NOT NULL,
  frequency_days integer NOT NULL CHECK (frequency_days > 0),
  last_done_on date,
  next_due_on date NOT NULL,
  provider text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  asset_id uuid NOT NULL REFERENCES public.maintenance_assets(id),
  plan_id uuid REFERENCES public.maintenance_plans(id),
  number text,
  kind text NOT NULL CHECK (kind IN ('preventive','corrective')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  failure_description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  technician text, provider text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, completed_at timestamptz,
  downtime_hours numeric NOT NULL DEFAULT 0 CHECK (downtime_hours >= 0),
  labour_cost numeric NOT NULL DEFAULT 0 CHECK (labour_cost >= 0),
  parts_cost numeric NOT NULL DEFAULT 0 CHECK (parts_cost >= 0),
  report text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.maintenance_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  work_order_id uuid NOT NULL REFERENCES public.maintenance_work_orders(id),
  name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.maintenance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.maintenance_assets(id),
  work_order_id uuid,
  event text NOT NULL,
  details jsonb,
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.maintenance_assets, public.maintenance_plans, public.maintenance_work_orders TO authenticated;
GRANT SELECT, INSERT ON public.maintenance_parts, public.maintenance_events TO authenticated;
GRANT ALL ON public.maintenance_assets, public.maintenance_plans, public.maintenance_work_orders, public.maintenance_parts, public.maintenance_events TO service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['maintenance_assets','maintenance_plans','maintenance_work_orders','maintenance_parts','maintenance_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''stations'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''stations''))', t);
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.logistics_no_delete()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['maintenance_assets','maintenance_plans','maintenance_work_orders'] LOOP
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

CREATE TRIGGER events_immutable BEFORE UPDATE ON public.maintenance_events FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE TRIGGER parts_immutable BEFORE UPDATE ON public.maintenance_parts FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();

-- Asset history
CREATE OR REPLACE FUNCTION public.maintenance_asset_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO maintenance_events(tenant_id,country_id,asset_id,event,details) VALUES (NEW.tenant_id,NEW.country_id,NEW.id,'created',to_jsonb(NEW));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO maintenance_events(tenant_id,country_id,asset_id,event,details) VALUES (NEW.tenant_id,NEW.country_id,NEW.id,'status',jsonb_build_object('from',OLD.status,'to',NEW.status));
  ELSE
    INSERT INTO maintenance_events(tenant_id,country_id,asset_id,event,details) VALUES (NEW.tenant_id,NEW.country_id,NEW.id,'updated',NULL);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER asset_after AFTER INSERT OR UPDATE ON public.maintenance_assets FOR EACH ROW EXECUTE FUNCTION public.maintenance_asset_after();

-- Work order rules: numbering, consistency, downtime, asset status, plan rescheduling
CREATE OR REPLACE FUNCTION public.maintenance_wo_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a maintenance_assets;
BEGIN
  SELECT * INTO a FROM maintenance_assets WHERE id=NEW.asset_id;
  IF a.id IS NULL OR a.tenant_id<>NEW.tenant_id OR a.country_id<>NEW.country_id THEN RAISE EXCEPTION 'Équipement hors périmètre'; END IF;
  IF TG_OP='INSERT' THEN
    NEW.number := 'OT-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(NEW.id::text,1,6));
    IF NEW.kind='corrective' AND coalesce(trim(NEW.failure_description),'')='' THEN RAISE EXCEPTION 'Description de la panne obligatoire'; END IF;
  ELSE
    IF OLD.status IN ('done','cancelled') THEN RAISE EXCEPTION 'Intervention clôturée : modification interdite'; END IF;
    NEW.number := OLD.number; NEW.asset_id := OLD.asset_id; NEW.opened_at := OLD.opened_at;
  END IF;
  IF NEW.status='in_progress' AND NEW.started_at IS NULL THEN NEW.started_at := now(); END IF;
  IF NEW.status='done' THEN
    IF coalesce(trim(NEW.report),'')='' THEN RAISE EXCEPTION 'Rapport d''intervention obligatoire'; END IF;
    NEW.completed_at := coalesce(NEW.completed_at, now());
    IF NEW.kind='corrective' THEN
      NEW.downtime_hours := round(extract(epoch FROM (NEW.completed_at - NEW.opened_at))/3600.0, 2);
    END IF;
  END IF;
  NEW.parts_cost := coalesce((SELECT sum(quantity*unit_cost) FROM maintenance_parts WHERE work_order_id=NEW.id),0);
  RETURN NEW;
END $$;
CREATE TRIGGER wo_before BEFORE INSERT OR UPDATE ON public.maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION public.maintenance_wo_before();

CREATE OR REPLACE FUNCTION public.maintenance_wo_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO maintenance_events(tenant_id,country_id,asset_id,work_order_id,event,details)
    VALUES (NEW.tenant_id,NEW.country_id,NEW.asset_id,NEW.id,'work_order_'||NEW.status,
      jsonb_build_object('number',NEW.number,'kind',NEW.kind,'downtime_hours',NEW.downtime_hours,'cost',NEW.labour_cost+NEW.parts_cost));
    IF NEW.status IN ('open','in_progress') THEN
      UPDATE maintenance_assets SET status = CASE WHEN NEW.kind='corrective' THEN 'down' ELSE 'maintenance' END WHERE id=NEW.asset_id AND status<>'retired';
    ELSIF NEW.status IN ('done','cancelled') THEN
      IF NOT EXISTS (SELECT 1 FROM maintenance_work_orders WHERE asset_id=NEW.asset_id AND id<>NEW.id AND status IN ('open','in_progress')) THEN
        UPDATE maintenance_assets SET status='active' WHERE id=NEW.asset_id AND status IN ('down','maintenance');
      END IF;
      IF NEW.status='done' AND NEW.plan_id IS NOT NULL THEN
        UPDATE maintenance_plans SET last_done_on=NEW.completed_at::date, next_due_on=NEW.completed_at::date + frequency_days WHERE id=NEW.plan_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wo_after AFTER INSERT OR UPDATE ON public.maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION public.maintenance_wo_after();

CREATE OR REPLACE FUNCTION public.maintenance_part_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w maintenance_work_orders;
BEGIN
  SELECT * INTO w FROM maintenance_work_orders WHERE id=NEW.work_order_id;
  IF w.id IS NULL OR w.tenant_id<>NEW.tenant_id OR w.country_id<>NEW.country_id THEN RAISE EXCEPTION 'Intervention hors périmètre'; END IF;
  IF w.status IN ('done','cancelled') THEN RAISE EXCEPTION 'Intervention clôturée'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER part_before BEFORE INSERT ON public.maintenance_parts FOR EACH ROW EXECUTE FUNCTION public.maintenance_part_before();
CREATE OR REPLACE FUNCTION public.maintenance_part_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE maintenance_work_orders SET updated_at=now() WHERE id=NEW.work_order_id;
  RETURN NEW;
END $$;
CREATE TRIGGER part_after AFTER INSERT ON public.maintenance_parts FOR EACH ROW EXECUTE FUNCTION public.maintenance_part_after();

CREATE OR REPLACE FUNCTION public.maintenance_plan_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a maintenance_assets;
BEGIN
  SELECT * INTO a FROM maintenance_assets WHERE id=NEW.asset_id;
  IF a.id IS NULL OR a.tenant_id<>NEW.tenant_id OR a.country_id<>NEW.country_id THEN RAISE EXCEPTION 'Équipement hors périmètre'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_before BEFORE INSERT OR UPDATE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION public.maintenance_plan_before();
