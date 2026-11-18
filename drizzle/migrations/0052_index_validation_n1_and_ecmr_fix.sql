ALTER TABLE public.index_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pre_enregistre',
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_by_name text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_comment text,
  ADD COLUMN IF NOT EXISTS sync_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.index_entries SET status = 'valide' WHERE status = 'pre_enregistre' AND created_at < now();
CREATE INDEX IF NOT EXISTS idx_index_entries_station_status ON public.index_entries(station_id, entry_date, status);

CREATE OR REPLACE FUNCTION public.index_entry_lock_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE via_rpc boolean := coalesce(current_setting('lumatek.index_validate', true),'') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT via_rpc THEN NEW.status := 'pre_enregistre'; NEW.validated_by := NULL; NEW.validated_by_name := NULL; NEW.validated_at := NULL; NEW.sync_warnings := '[]'::jsonb; END IF;
    RETURN NEW;
  END IF;
  IF via_rpc THEN RETURN COALESCE(NEW, OLD); END IF;
  IF OLD.status = 'valide' THEN RAISE EXCEPTION 'Saisie validée par le N+1 : modification impossible'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.status := OLD.status; NEW.validated_by := OLD.validated_by; NEW.validated_by_name := OLD.validated_by_name;
  NEW.validated_at := OLD.validated_at; NEW.sync_warnings := OLD.sync_warnings;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS index_entry_lock ON public.index_entries;
CREATE TRIGGER index_entry_lock BEFORE INSERT OR UPDATE OR DELETE ON public.index_entries
  FOR EACH ROW EXECUTE FUNCTION public.index_entry_lock_before();

CREATE OR REPLACE FUNCTION public.index_child_lock_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE eid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
BEGIN
  IF coalesce(current_setting('lumatek.index_validate', true),'') <> 'on'
     AND EXISTS (SELECT 1 FROM index_entries WHERE id = eid AND status = 'valide') THEN
    RAISE EXCEPTION 'Saisie validée par le N+1 : modification impossible';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS pump_index_lock ON public.pump_index_entries;
CREATE TRIGGER pump_index_lock BEFORE INSERT OR UPDATE OR DELETE ON public.pump_index_entries
  FOR EACH ROW EXECUTE FUNCTION public.index_child_lock_before();
DROP TRIGGER IF EXISTS tank_reading_lock ON public.index_tank_readings;
CREATE TRIGGER tank_reading_lock BEFORE INSERT OR UPDATE OR DELETE ON public.index_tank_readings
  FOR EACH ROW EXECUTE FUNCTION public.index_child_lock_before();

CREATE OR REPLACE FUNCTION public.validate_index_entry(_id uuid, _comment text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); e record; tk record; qty numeric; warns jsonb := '[]'::jsonb; ref text; mdate timestamptz; uname text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO e FROM index_entries WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT can_access_tenant_country(uid, e.tenant_id, e.country_id) THEN RAISE EXCEPTION 'Saisie introuvable'; END IF;
  IF NOT (is_platform_admin(uid) OR has_permission(uid, 'index_entries.validate')) THEN RAISE EXCEPTION 'Validation réservée au N+1 (index_entries.validate)'; END IF;
  IF e.status = 'valide' THEN RAISE EXCEPTION 'Saisie déjà validée'; END IF;
  IF e.user_id = uid AND NOT is_platform_admin(uid) THEN RAISE EXCEPTION 'Vous ne pouvez pas valider votre propre saisie'; END IF;
  IF e.entry_date > (now() AT TIME ZONE 'Africa/Porto-Novo')::date THEN RAISE EXCEPTION 'Date future'; END IF;
  IF EXISTS (SELECT 1 FROM index_entries WHERE station_id = e.station_id AND entry_date < e.entry_date AND status <> 'valide') THEN
    RAISE EXCEPTION 'Validez d''abord les saisies antérieures de cette station (ordre chronologique)';
  END IF;
  PERFORM set_config('lumatek.index_validate', 'on', true);
  ref := 'IDX-' || to_char(e.entry_date,'YYYYMMDD') || '-' || left(_id::text, 8);
  mdate := (e.entry_date::timestamp + interval '20 hours') AT TIME ZONE 'Africa/Porto-Novo';
  FOR tk IN SELECT t.id, t.name, t.product_id, r.jauge FROM tanks t
            LEFT JOIN index_tank_readings r ON r.entry_id = _id AND r.tank_id = t.id
            WHERE t.station_id = e.station_id AND (r.id IS NOT NULL OR EXISTS (SELECT 1 FROM pump_index_entries p WHERE p.entry_id = _id AND p.tank_id = t.id)) LOOP
    IF tk.product_id IS NULL THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : produit non configuré, stock non mis à jour'); CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM stock_movements WHERE reference = ref AND tank_id = tk.id) THEN CONTINUE; END IF;
    SELECT coalesce(sum(coalesce(liters_net, liters_sold)),0) INTO qty FROM pump_index_entries WHERE entry_id = _id AND tank_id = tk.id;
    BEGIN
      IF qty > 0 THEN
        INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,reason,reference,movement_date)
        VALUES (e.tenant_id,e.country_id,'station',e.station_id,tk.id,tk.product_id,'sale',qty,'Sorties nettes pistolets (saisie index validée)',ref,mdate);
      END IF;
    EXCEPTION WHEN others THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : vente non passée au stock (' || SQLERRM || ')');
    END;
    BEGIN
      IF tk.jauge IS NOT NULL THEN
        INSERT INTO stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,physical_level,reason,reference,movement_date)
        VALUES (e.tenant_id,e.country_id,'station',e.station_id,tk.id,tk.product_id,'inventory',0,tk.jauge,'Jauge du soir (saisie index validée)',ref,mdate);
      END IF;
    EXCEPTION WHEN others THEN warns := warns || jsonb_build_array('Cuve ' || tk.name || ' : jauge non passée au stock (' || SQLERRM || ')');
    END;
  END LOOP;
  SELECT full_name INTO uname FROM profiles WHERE user_id = uid;
  UPDATE index_entries SET status = 'valide', validated_by = uid, validated_by_name = uname, validated_at = now(),
    validation_comment = nullif(trim(coalesce(_comment,'')),''), sync_warnings = warns WHERE id = _id;
  PERFORM audit_business_event('index_validate','index_entries','index_entry',_id::text,e.country_id,jsonb_build_object('date',e.entry_date,'warnings',warns),NULL);
  RETURN jsonb_build_object('id',_id,'warnings',warns);
END $$;
REVOKE ALL ON FUNCTION public.validate_index_entry(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_index_entry(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.index_entry_lock_before() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.index_child_lock_before() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.logistics_sign_cmr(_trip uuid, _role text, _site_key text, _name text, _png text, _decision text, _reserves text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; num text; rid uuid; dec text := coalesce(_decision,'signed');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT * INTO t FROM logistics_trips WHERE id = _trip;
  IF NOT FOUND OR NOT can_access_tenant_country(auth.uid(), t.tenant_id, t.country_id) THEN RAISE EXCEPTION 'Transport introuvable'; END IF;
  IF NOT (is_module_enabled(t.tenant_id, t.country_id, 'livraisons') OR is_module_enabled(t.tenant_id, t.country_id, 'logistique_avancee')) THEN RAISE EXCEPTION 'Module désactivé'; END IF;
  IF NOT tenant_write_allowed(t.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
  IF NOT (can_write_module(auth.uid(), 'livraisons') OR can_write_module(auth.uid(), 'supplies')) THEN RAISE EXCEPTION 'Permission refusée'; END IF;
  IF _role NOT IN ('shipper','carrier','consignee') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN RAISE EXCEPTION 'Nom du signataire requis'; END IF;
  IF _png IS NULL OR _png NOT LIKE 'data:image/png;base64,%' OR length(_png) < 200 OR length(_png) > 400000 THEN RAISE EXCEPTION 'Signature invalide'; END IF;
  IF _role = 'consignee' THEN
    IF coalesce(_site_key,'') = '' THEN RAISE EXCEPTION 'Site destinataire requis'; END IF;
    IF dec NOT IN ('accepted','accepted_with_reserves','refused') THEN RAISE EXCEPTION 'Décision invalide'; END IF;
    IF dec <> 'accepted' AND length(trim(coalesce(_reserves,''))) < 3 THEN RAISE EXCEPTION 'Motif des réserves requis'; END IF;
    IF NOT EXISTS (SELECT 1 FROM logistics_trip_loads l WHERE l.trip_id = _trip AND l.destination_type || ':' || coalesce(l.station_id, l.client_id)::text = _site_key) THEN RAISE EXCEPTION 'Site hors plan de chargement'; END IF;
    IF EXISTS (SELECT 1 FROM logistics_trip_loads l WHERE l.trip_id = _trip AND l.destination_type || ':' || coalesce(l.station_id, l.client_id)::text = _site_key
               AND NOT EXISTS (SELECT 1 FROM logistics_load_deliveries d WHERE d.load_id = l.id)) THEN RAISE EXCEPTION 'Validez d''abord la livraison de ce site'; END IF;
  ELSE dec := 'signed'; _site_key := ''; END IF;
  num := 'AR-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6));
  INSERT INTO logistics_cmr_signatures(tenant_id,country_id,trip_id,role,site_key,signer_name,signature_png,decision,reserves,receipt_number,signed_by)
  VALUES (t.tenant_id,t.country_id,_trip,_role,_site_key,trim(_name),_png,dec,nullif(trim(coalesce(_reserves,'')),''),num,auth.uid()) RETURNING id INTO rid;
  PERFORM audit_business_event('ecmr_sign','livraisons','logistics_trip',_trip::text,t.country_id,jsonb_build_object('role',_role,'site',_site_key,'decision',dec,'receipt',num),NULL);
  RETURN jsonb_build_object('id',rid,'receipt_number',num);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Déjà signé pour ce rôle';
END $function$;