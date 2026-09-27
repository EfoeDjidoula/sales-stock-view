
CREATE TABLE public.units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'volume' CHECK (kind IN ('volume','mass','count','other')),
  factor_to_base numeric NOT NULL DEFAULT 1 CHECK (factor_to_base > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX units_code_uniq ON public.units_of_measure (COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Units readable" ON public.units_of_measure FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Units insert" ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
CREATE POLICY "Units update" ON public.units_of_measure FOR UPDATE TO authenticated USING ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
CREATE POLICY "Units delete" ON public.units_of_measure FOR DELETE TO authenticated USING ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
INSERT INTO public.units_of_measure (code,name,kind,factor_to_base) VALUES
 ('L','Litre','volume',1),('m3','Mètre cube','volume',1000),('kg','Kilogramme','mass',1),('t','Tonne','mass',1000),('u','Unité','count',1);

CREATE TABLE public.equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  category text NOT NULL CHECK (category IN ('tank','pump','nozzle','depot','other')),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX equipment_types_code_uniq ON public.equipment_types (COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), category, code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_types TO authenticated;
GRANT ALL ON public.equipment_types TO service_role;
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Eq readable" ON public.equipment_types FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Eq insert" ON public.equipment_types FOR INSERT TO authenticated WITH CHECK ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
CREATE POLICY "Eq update" ON public.equipment_types FOR UPDATE TO authenticated USING ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
CREATE POLICY "Eq delete" ON public.equipment_types FOR DELETE TO authenticated USING ((tenant_id IS NULL AND public.is_platform_admin(auth.uid())) OR (tenant_id IS NOT NULL AND public.can_access_tenant(auth.uid(), tenant_id) AND public.can_write_module(auth.uid(),'stations')));
INSERT INTO public.equipment_types (category,code,name) VALUES
 ('tank','UNDERGROUND','Cuve enterrée'),('tank','ABOVEGROUND','Cuve aérienne'),('tank','COMPARTMENT','Cuve compartimentée'),
 ('pump','SINGLE','Pompe simple'),('pump','DOUBLE','Pompe double'),('pump','MULTI','Pompe multi-produits'),
 ('nozzle','STANDARD','Pistolet standard'),('nozzle','HIGH_FLOW','Pistolet grand débit'),
 ('depot','STORAGE','Dépôt de stockage'),('depot','TRANSIT','Dépôt de transit');

-- Produits
CREATE TABLE public.petroleum_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'fuel',
  color text NOT NULL DEFAULT '#f59e0b',
  unit_id uuid REFERENCES public.units_of_measure(id),
  density numeric CHECK (density IS NULL OR density > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, code)
);

CREATE TABLE public.depots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  code text,
  name text NOT NULL,
  location text,
  equipment_type_id uuid REFERENCES public.equipment_types(id),
  capacity_liters numeric NOT NULL DEFAULT 0 CHECK (capacity_liters >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance'));
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS depot_id uuid REFERENCES public.depots(id) ON DELETE SET NULL;
ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance'));
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.petroleum_products(id);
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS equipment_type_id uuid REFERENCES public.equipment_types(id);
ALTER TABLE public.tanks ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units_of_measure(id);
ALTER TABLE public.pumps ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance'));
ALTER TABLE public.pumps ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.petroleum_products(id);
ALTER TABLE public.pumps ADD COLUMN IF NOT EXISTS equipment_type_id uuid REFERENCES public.equipment_types(id);

CREATE TABLE public.nozzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  pump_id uuid NOT NULL REFERENCES public.pumps(id) ON DELETE CASCADE,
  tank_id uuid REFERENCES public.tanks(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.petroleum_products(id),
  equipment_type_id uuid REFERENCES public.equipment_types(id),
  number integer NOT NULL DEFAULT 1 CHECK (number > 0),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','maintenance')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pump_id, number)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['petroleum_products','depots','nozzles'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE POLICY "Writers delete" ON public.%I FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id)) WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "License write delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "RBAC write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE POLICY "RBAC write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE POLICY "RBAC write delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE TRIGGER trg_set_tenant_country BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_country_context()', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(''stations'')', t);
  END LOOP;
END $$;

CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('stations');
CREATE TRIGGER zz_audit AFTER INSERT OR UPDATE OR DELETE ON public.equipment_types FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('stations');
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.equipment_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cohérence pistolet
CREATE OR REPLACE FUNCTION public.validate_nozzle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; tk record;
BEGIN
  SELECT station_id, product_id INTO p FROM public.pumps WHERE id = NEW.pump_id;
  IF p.station_id IS DISTINCT FROM NEW.station_id THEN
    RAISE EXCEPTION 'Le pistolet doit appartenir à la même station que sa pompe';
  END IF;
  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id, product_id INTO tk FROM public.tanks WHERE id = NEW.tank_id;
    IF tk.station_id IS DISTINCT FROM NEW.station_id THEN
      RAISE EXCEPTION 'La cuve du pistolet doit appartenir à la même station';
    END IF;
    IF NEW.product_id IS NULL THEN NEW.product_id := tk.product_id; END IF;
    IF tk.product_id IS NOT NULL AND NEW.product_id IS DISTINCT FROM tk.product_id THEN
      RAISE EXCEPTION 'Le produit du pistolet doit correspondre au produit de la cuve';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.validate_nozzle() FROM PUBLIC, anon;
CREATE TRIGGER trg_validate_nozzle BEFORE INSERT OR UPDATE ON public.nozzles FOR EACH ROW EXECUTE FUNCTION public.validate_nozzle();

-- Backfill produits
INSERT INTO public.petroleum_products (tenant_id, country_id, code, name, color, unit_id, position)
SELECT s.tenant_id, s.country_id, v.code, v.name, v.color, (SELECT id FROM public.units_of_measure WHERE tenant_id IS NULL AND code='L'), v.pos
FROM (
  SELECT tenant_id, country_id FROM public.tenant_countries
  UNION SELECT tenant_id, country_id FROM public.tanks WHERE tenant_id IS NOT NULL
  UNION SELECT tenant_id, country_id FROM public.pumps WHERE tenant_id IS NOT NULL
) s
CROSS JOIN (VALUES ('super','Super','#f59e0b',1),('gasoil','Gasoil','#3b82f6',2)) v(code,name,color,pos)
ON CONFLICT (tenant_id, country_id, code) DO NOTHING;

UPDATE public.tanks t SET product_id = p.id FROM public.petroleum_products p
 WHERE t.product_id IS NULL AND p.tenant_id = t.tenant_id AND p.country_id IS NOT DISTINCT FROM t.country_id AND p.code = t.product_type;
UPDATE public.pumps t SET product_id = p.id FROM public.petroleum_products p
 WHERE t.product_id IS NULL AND p.tenant_id = t.tenant_id AND p.country_id IS NOT DISTINCT FROM t.country_id AND p.code = t.product_type;

INSERT INTO public.nozzles (tenant_id, country_id, station_id, pump_id, tank_id, product_id, number, name)
SELECT pu.tenant_id, pu.country_id, pu.station_id, pu.id,
  CASE WHEN tk.station_id = pu.station_id AND (tk.product_id IS NULL OR tk.product_id = pu.product_id) THEN pu.tank_id END,
  pu.product_id, 1, pu.name || ' - P1'
FROM public.pumps pu LEFT JOIN public.tanks tk ON tk.id = pu.tank_id
WHERE NOT EXISTS (SELECT 1 FROM public.nozzles n WHERE n.pump_id = pu.id);
