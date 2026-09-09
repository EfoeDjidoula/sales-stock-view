-- 1. Catalogue des modules
CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_core boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modules readable by authenticated"
ON public.modules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Platform admins manage modules"
ON public.modules FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_modules_updated_at
BEFORE UPDATE ON public.modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Catalogue initial
INSERT INTO public.modules (key, label, description, category, is_core, position) VALUES
  ('dashboard','Dashboard','Tableau de bord et indicateurs de synthèse','pilotage',true,10),
  ('stations','Stations','Gestion du réseau de stations','reseau',true,20),
  ('depots','Dépôts','Gestion des dépôts et dépotages','reseau',false,30),
  ('stocks','Stocks','Suivi des stocks et jauges','exploitation',true,40),
  ('ventes','Ventes','Suivi des ventes carburant','exploitation',true,50),
  ('livraisons','Livraisons','Livraisons et approvisionnements','logistique',false,60),
  ('achats','Achats','Achats et fournisseurs','logistique',false,70),
  ('commandes','Commandes','Commandes et proformas','logistique',false,80),
  ('clients_b2b','Clients B2B','Comptes clients professionnels','commercial',false,90),
  ('cartes_carburant','Cartes carburant','Cartes carburant clients','commercial',false,100),
  ('plafonds','Gestion des plafonds','Plafonds de consommation','commercial',false,110),
  ('fidelite','Fidélité','Programme de fidélité','commercial',false,120),
  ('tickets_valeur','Tickets valeur','Bons et tickets valeur','commercial',false,130),
  ('cuves','Cuves','Configuration des cuves','equipement',false,140),
  ('pompes','Pompes','Configuration des pompes','equipement',false,150),
  ('pistolets','Pistolets','Configuration des pistolets','equipement',false,160),
  ('index','Index','Saisie des index de pompe','exploitation',true,170),
  ('jaugeage','Jaugeage','Relevés de jauge','exploitation',false,180),
  ('calibration','Calibration','Calibration des équipements','equipement',false,190),
  ('controle','Contrôle','Contrôles d''exploitation','conformite',false,200),
  ('anti_fraude','Anti-fraude','Détection des anomalies et fraudes','conformite',false,210),
  ('maintenance','Maintenance','Maintenance des équipements','equipement',false,220),
  ('perequation','Péréquation transport','Zones, taux et paiements de péréquation','conformite',false,230),
  ('facturation','Facturation','Facturation et structures de prix','finance',false,240),
  ('reporting','Reporting','Rapports et exports','pilotage',false,250),
  ('ia','Intelligence Artificielle','Assistance et analyses IA','pilotage',false,260),
  ('audit','Audit','Journal et pistes d''audit','conformite',false,270);

-- 3. Surcharge par pays
CREATE TABLE public.country_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.modules(key) ON UPDATE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, country_id, module_key)
);

GRANT SELECT ON public.country_modules TO authenticated;
GRANT ALL ON public.country_modules TO service_role;
ALTER TABLE public.country_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read country modules"
ON public.country_modules FOR SELECT TO authenticated
USING (public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY "Platform admins manage country modules"
ON public.country_modules FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_country_modules_updated_at
BEFORE UPDATE ON public.country_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. tenant_modules : rattachement au catalogue + complétude
INSERT INTO public.tenant_modules (tenant_id, module_key, is_enabled, allowed_roles, position)
SELECT t.id, m.key, true, ARRAY[]::app_role[], m.position
FROM public.tenants t
CROSS JOIN public.modules m
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_modules tm
  WHERE tm.tenant_id = t.id AND tm.module_key = m.key
);

-- 5. Résolution effective : pays > client > actif par défaut
CREATE OR REPLACE FUNCTION public.is_module_enabled(_tenant_id uuid, _country_id uuid, _module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT cm.is_enabled FROM public.country_modules cm
      WHERE cm.tenant_id = _tenant_id AND cm.country_id = _country_id AND cm.module_key = _module_key),
    (SELECT tm.is_enabled FROM public.tenant_modules tm
      WHERE tm.tenant_id = _tenant_id AND tm.module_key = _module_key),
    true
  )
$$;

-- 6. Protection des données par module (restrictive : s'ajoute aux règles existantes)
CREATE POLICY "module_gate_clients" ON public.clients AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'clients_b2b'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'clients_b2b'));

CREATE POLICY "module_gate_suppliers" ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'achats'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'achats'));

CREATE POLICY "module_gate_orders" ON public.orders AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'commandes'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'commandes'));

CREATE POLICY "module_gate_supplies" ON public.supplies AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'livraisons'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'livraisons'));

CREATE POLICY "module_gate_depotages" ON public.depotages AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'depots'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'depots'));

CREATE POLICY "module_gate_tanks" ON public.tanks AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'cuves'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'cuves'));

CREATE POLICY "module_gate_pumps" ON public.pumps AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'pompes'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'pompes'));

CREATE POLICY "module_gate_index_entries" ON public.index_entries AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'index'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'index'));

CREATE POLICY "module_gate_pump_index_entries" ON public.pump_index_entries AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'index'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'index'));

CREATE POLICY "module_gate_perequation_entries" ON public.perequation_entries AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'perequation'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'perequation'));

CREATE POLICY "module_gate_perequation_rates" ON public.perequation_rates AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'perequation'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'perequation'));

CREATE POLICY "module_gate_perequation_zones" ON public.perequation_zones AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'perequation'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'perequation'));

CREATE POLICY "module_gate_price_structures" ON public.price_structures AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'facturation'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'facturation'));

CREATE POLICY "module_gate_trucks" ON public.trucks AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_module_enabled(tenant_id, country_id, 'livraisons'))
WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'livraisons'));