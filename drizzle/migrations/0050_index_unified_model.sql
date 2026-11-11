-- 1. Retour en cuve par pistolet + sortie réelle
ALTER TABLE public.pump_index_entries ADD COLUMN IF NOT EXISTS retour_cuve numeric NOT NULL DEFAULT 0;
ALTER TABLE public.pump_index_entries ADD COLUMN IF NOT EXISTS liters_net numeric
  GENERATED ALWAYS AS (GREATEST(index_arrivee - index_depart, 0) - retour_cuve) STORED;

CREATE OR REPLACE FUNCTION public.validate_pump_index_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p_station uuid;
  _p_tank uuid;
  _p_product text;
BEGIN
  IF NEW.index_depart < 0 OR NEW.index_arrivee < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour les index';
  END IF;
  IF NEW.retour_cuve IS NULL OR NEW.retour_cuve < 0 THEN
    RAISE EXCEPTION 'Le retour en cuve ne peut pas être négatif';
  END IF;
  IF NEW.retour_cuve > GREATEST(NEW.index_arrivee - NEW.index_depart, 0) THEN
    RAISE EXCEPTION 'Le retour en cuve (% L) dépasse le volume débité par le pistolet (% L)',
      NEW.retour_cuve, GREATEST(NEW.index_arrivee - NEW.index_depart, 0);
  END IF;
  SELECT station_id, tank_id, product_type INTO _p_station, _p_tank, _p_product
  FROM public.pumps WHERE id = NEW.pump_id;
  IF _p_station IS NULL THEN
    RAISE EXCEPTION 'Pompe introuvable';
  END IF;
  IF _p_station <> NEW.station_id THEN
    RAISE EXCEPTION 'La pompe doit appartenir à la station de la saisie';
  END IF;
  IF _p_product <> NEW.product_type THEN
    RAISE EXCEPTION 'Le type de produit doit correspondre à la pompe';
  END IF;
  IF NEW.tank_id IS NOT NULL AND _p_tank IS NOT NULL AND NEW.tank_id <> _p_tank THEN
    RAISE EXCEPTION 'La cuve doit correspondre à la liaison pompe/cuve';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Détail des ventes & versement banque
ALTER TABLE public.index_entries
  ADD COLUMN IF NOT EXISTS autoconso_montant numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bons_clients_montant numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tickets_valeur_montant numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cartes_montant numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vente_globale numeric,
  ADD COLUMN IF NOT EXISTS banque_nom text;

ALTER TABLE public.index_entries
  ADD COLUMN IF NOT EXISTS montant_a_verser numeric GENERATED ALWAYS AS (
    vente_globale - autoconso_montant - bons_clients_montant - tickets_valeur_montant - cartes_montant - versement_momo
  ) STORED,
  ADD COLUMN IF NOT EXISTS ecart_versement numeric GENERATED ALWAYS AS (
    versement_banque - (vente_globale - autoconso_montant - bons_clients_montant - tickets_valeur_montant - cartes_montant - versement_momo)
  ) STORED;

CREATE OR REPLACE FUNCTION public.check_no_negative_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.super1_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_index_depart'; END IF;
  IF NEW.super1_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_index_arrivee'; END IF;
  IF NEW.super1_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_jauge'; END IF;
  IF NEW.super2_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_index_depart'; END IF;
  IF NEW.super2_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_index_arrivee'; END IF;
  IF NEW.super2_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_jauge'; END IF;
  IF NEW.gasoil1_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_index_depart'; END IF;
  IF NEW.gasoil1_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_index_arrivee'; END IF;
  IF NEW.gasoil1_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_jauge'; END IF;
  IF NEW.gasoil2_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_index_depart'; END IF;
  IF NEW.gasoil2_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_index_arrivee'; END IF;
  IF NEW.gasoil2_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_jauge'; END IF;
  IF NEW.versement_momo < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_momo'; END IF;
  IF NEW.versement_banque < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_banque'; END IF;
  IF NEW.versement_liquidite < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_liquidite'; END IF;
  IF NEW.bons_carburant_nombre < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_carburant_nombre'; END IF;
  IF NEW.bons_carburant_valeur < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_carburant_valeur'; END IF;
  IF NEW.bons_entreprise_nombre < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_entreprise_nombre'; END IF;
  IF NEW.bons_entreprise_valeur < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_entreprise_valeur'; END IF;
  IF NEW.autoconso_montant < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour l''autoconsommation'; END IF;
  IF NEW.bons_clients_montant < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour les bons clients'; END IF;
  IF NEW.tickets_valeur_montant < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour les tickets valeur'; END IF;
  IF NEW.cartes_montant < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour les ventes par carte'; END IF;
  IF NEW.vente_globale IS NOT NULL AND NEW.vente_globale < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour la vente globale'; END IF;
  RETURN NEW;
END;
$function$;

-- Vente globale recalculée côté serveur : somme des sorties réelles x prix de la structure de prix active
CREATE OR REPLACE FUNCTION public.index_entry_sales_value(_entry_id uuid, _tenant uuid, _country uuid, _date date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sp numeric; _gp numeric; _s numeric; _g numeric; _n integer;
BEGIN
  SELECT count(*),
         COALESCE(sum(liters_net) FILTER (WHERE product_type = 'super'), 0),
         COALESCE(sum(liters_net) FILTER (WHERE product_type = 'gasoil'), 0)
    INTO _n, _s, _g
  FROM public.pump_index_entries WHERE entry_id = _entry_id;
  IF _n = 0 THEN RETURN NULL; END IF;
  SELECT super_price, gasoil_price INTO _sp, _gp
  FROM public.price_structures
  WHERE is_active AND effective_date <= _date
    AND tenant_id IS NOT DISTINCT FROM _tenant
    AND (country_id IS NULL OR country_id = _country)
  ORDER BY effective_date DESC LIMIT 1;
  IF _sp IS NULL OR _gp IS NULL OR (_sp = 0 AND _gp = 0) THEN RETURN NULL; END IF;
  RETURN round(_s * _sp + _g * _gp, 2);
END;
$function$;
REVOKE ALL ON FUNCTION public.index_entry_sales_value(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.index_entry_sales_value(uuid, uuid, uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.index_entry_sales_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _v numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _v := public.index_entry_sales_value(NEW.id, NEW.tenant_id, NEW.country_id, NEW.entry_date);
    IF _v IS NOT NULL THEN NEW.vente_globale := _v; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_index_entry_sales ON public.index_entries;
CREATE TRIGGER trg_index_entry_sales BEFORE UPDATE ON public.index_entries
  FOR EACH ROW EXECUTE FUNCTION public.index_entry_sales_before();

-- 3. Bilan cuve journalier
CREATE TABLE IF NOT EXISTS public.index_tank_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.index_entries(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES public.tanks(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  product_type text NOT NULL,
  stock_ouverture numeric NOT NULL DEFAULT 0,
  depotage numeric NOT NULL DEFAULT 0,
  depotage_refs text,
  sortie numeric NOT NULL DEFAULT 0,
  stock_cloture numeric GENERATED ALWAYS AS (stock_ouverture + depotage - sortie) STORED,
  jauge numeric NOT NULL DEFAULT 0,
  ecart numeric GENERATED ALWAYS AS (jauge - (stock_ouverture + depotage - sortie)) STORED,
  tenant_id uuid,
  country_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, tank_id)
);
CREATE INDEX IF NOT EXISTS idx_index_tank_readings_tank_date ON public.index_tank_readings (tank_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.index_tank_readings TO authenticated;
GRANT ALL ON public.index_tank_readings TO service_role;
ALTER TABLE public.index_tank_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View tank readings" ON public.index_tank_readings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "Insert own tank readings" ON public.index_tank_readings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));
CREATE POLICY "Update own tank readings" ON public.index_tank_readings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.can_write_station(auth.uid(), station_id));
CREATE POLICY "Delete own tank readings" ON public.index_tank_readings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Tenant isolation" ON public.index_tank_readings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id)) WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Strict tenant country isolation" ON public.index_tank_readings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "RBAC write insert" ON public.index_tank_readings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.can_write_module(auth.uid(), 'index_entries'));
CREATE POLICY "RBAC write update" ON public.index_tank_readings AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_write_module(auth.uid(), 'index_entries'));
CREATE POLICY "RBAC write delete" ON public.index_tank_readings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.can_write_module(auth.uid(), 'index_entries'));
CREATE POLICY "License write insert" ON public.index_tank_readings AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.tenant_write_allowed(tenant_id));
CREATE POLICY "License write update" ON public.index_tank_readings AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.tenant_write_allowed(tenant_id)) WITH CHECK (public.tenant_write_allowed(tenant_id));
CREATE POLICY "License write delete" ON public.index_tank_readings AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.tenant_write_allowed(tenant_id));
CREATE POLICY module_gate_index_tank_readings ON public.index_tank_readings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_module_enabled(tenant_id, country_id, 'index')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'index'));

-- Contrôles serveur : contexte hérité de la saisie, dépotages = réceptions validées, sortie = sorties réelles des pistolets
CREATE OR REPLACE FUNCTION public.index_tank_reading_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _e record; _t record; _tz text; _prev numeric; _dep numeric; _refs text;
BEGIN
  SELECT id, station_id, entry_date, tenant_id, country_id INTO _e FROM public.index_entries WHERE id = NEW.entry_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'Saisie d''index introuvable'; END IF;
  SELECT id, station_id, product_type INTO _t FROM public.tanks WHERE id = NEW.tank_id;
  IF _t.id IS NULL OR _t.station_id <> _e.station_id THEN
    RAISE EXCEPTION 'La cuve doit appartenir à la station de la saisie';
  END IF;
  IF NEW.jauge IS NULL OR NEW.jauge < 0 OR NEW.stock_ouverture < 0 THEN
    RAISE EXCEPTION 'Valeurs négatives interdites pour les jauges et stocks';
  END IF;
  NEW.station_id := _e.station_id;
  NEW.entry_date := _e.entry_date;
  NEW.tenant_id := _e.tenant_id;
  NEW.country_id := _e.country_id;
  NEW.product_type := _t.product_type;

  -- Stock d'ouverture = jauge de la veille (dernier bilan connu), sinon valeur saisie
  SELECT r.jauge INTO _prev FROM public.index_tank_readings r
   WHERE r.tank_id = NEW.tank_id AND r.entry_date < _e.entry_date
   ORDER BY r.entry_date DESC LIMIT 1;
  IF _prev IS NOT NULL THEN NEW.stock_ouverture := _prev; END IF;

  -- Dépotages = réceptions validées du jour sur cette cuve
  SELECT COALESCE(c.timezone, 'Africa/Porto-Novo') INTO _tz FROM public.countries c WHERE c.id = _e.country_id;
  _tz := COALESCE(_tz, 'Africa/Porto-Novo');
  SELECT COALESCE(sum(s.qty_received), 0),
         string_agg(s.reference || COALESCE(' / BL ' || s.bl_number, '') || COALESCE(' / ' || s.driver_name, ''), ' ; ')
    INTO _dep, _refs
  FROM public.supply_requests s
  WHERE s.tank_id = NEW.tank_id AND s.status = 'received' AND s.received_at IS NOT NULL
    AND (s.received_at AT TIME ZONE _tz)::date = _e.entry_date;
  NEW.depotage := _dep;
  NEW.depotage_refs := _refs;

  -- Sortie = somme des sorties réelles (index - retour en cuve) des pistolets reliés à la cuve
  SELECT COALESCE(sum(p.liters_net), 0) INTO NEW.sortie
  FROM public.pump_index_entries p WHERE p.entry_id = NEW.entry_id AND p.tank_id = NEW.tank_id;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_index_tank_reading_before BEFORE INSERT OR UPDATE ON public.index_tank_readings
  FOR EACH ROW EXECUTE FUNCTION public.index_tank_reading_before();
CREATE TRIGGER trg_index_tank_reading_fiscal BEFORE INSERT OR UPDATE ON public.index_tank_readings
  FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_year_open();
CREATE TRIGGER zz_audit AFTER INSERT OR DELETE OR UPDATE ON public.index_tank_readings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('index');

-- Après écriture des pistolets : recalcul de la vente globale et du bilan cuve
CREATE OR REPLACE FUNCTION public.pump_index_after_stmt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.index_entries e SET updated_at = now()
   WHERE e.id IN (SELECT DISTINCT entry_id FROM chg);
  UPDATE public.index_tank_readings r SET updated_at = now()
   WHERE r.entry_id IN (SELECT DISTINCT entry_id FROM chg);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_pump_index_after_ins AFTER INSERT ON public.pump_index_entries
  REFERENCING NEW TABLE AS chg FOR EACH STATEMENT EXECUTE FUNCTION public.pump_index_after_stmt();
CREATE TRIGGER trg_pump_index_after_upd AFTER UPDATE ON public.pump_index_entries
  REFERENCING NEW TABLE AS chg FOR EACH STATEMENT EXECUTE FUNCTION public.pump_index_after_stmt();

REVOKE ALL ON FUNCTION public.index_tank_reading_before() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pump_index_after_stmt() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.index_entry_sales_before() FROM PUBLIC, anon;