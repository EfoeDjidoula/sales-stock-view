CREATE OR REPLACE FUNCTION public.sec_trip_carrier_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.carrier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.logistics_carriers lc WHERE lc.id = NEW.carrier_id AND lc.tenant_id = NEW.tenant_id AND lc.country_id = NEW.country_id) THEN
    RAISE EXCEPTION 'Transporteur hors périmètre';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_trip_carrier_scope ON public.logistics_trips;
CREATE TRIGGER sec_trip_carrier_scope BEFORE INSERT OR UPDATE OF carrier_id, tenant_id, country_id ON public.logistics_trips FOR EACH ROW EXECUTE FUNCTION public.sec_trip_carrier_scope();

CREATE OR REPLACE FUNCTION public.sec_closure_n1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'validated' AND OLD.status = 'submitted' AND auth.uid() IS NOT NULL
     AND (OLD.submitted_by = auth.uid() OR OLD.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Validation N+1 : la clôture doit être validée par une autre personne que celle qui l''a saisie ou soumise';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_closure_n1 ON public.daily_closures;
CREATE TRIGGER sec_closure_n1 BEFORE UPDATE OF status ON public.daily_closures FOR EACH ROW EXECUTE FUNCTION public.sec_closure_n1();

CREATE OR REPLACE FUNCTION public.sec_hse_independent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'hse_inspections' AND NEW.status = 'validated' AND OLD.status = 'submitted' AND OLD.submitted_by = auth.uid() THEN
    RAISE EXCEPTION 'Une inspection doit être validée par une autre personne que celle qui l''a soumise';
  END IF;
  IF TG_TABLE_NAME = 'hse_nonconformities' AND NEW.status = 'closed' AND OLD.status = 'pending_validation' AND OLD.closure_submitted_by = auth.uid() THEN
    RAISE EXCEPTION 'La clôture doit être validée par une autre personne que celle qui l''a soumise';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sec_hse_independent ON public.hse_inspections;
CREATE TRIGGER sec_hse_independent BEFORE UPDATE OF status ON public.hse_inspections FOR EACH ROW EXECUTE FUNCTION public.sec_hse_independent();
DROP TRIGGER IF EXISTS sec_hse_independent ON public.hse_nonconformities;
CREATE TRIGGER sec_hse_independent BEFORE UPDATE OF status ON public.hse_nonconformities FOR EACH ROW EXECUTE FUNCTION public.sec_hse_independent();
REVOKE EXECUTE ON FUNCTION public.sec_trip_carrier_scope(), public.sec_closure_n1(), public.sec_hse_independent() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_business_event(_action text, _module text, _entity_type text, _entity_id text, _country_id uuid, _details jsonb, _device text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); m record; uname text; _tenant uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT full_name, tenant_id INTO uname, _tenant FROM public.profiles WHERE user_id = uid LIMIT 1;
  IF _country_id IS NOT NULL AND NOT public.can_access_tenant_country(uid, _tenant, _country_id) THEN RAISE EXCEPTION 'Pays hors périmètre'; END IF;
  SELECT * INTO m FROM public.audit_request_meta();
  INSERT INTO public.audit_logs(tenant_id, country_id, user_id, user_name, action, module, entity_type, entity_id, new_value, ip_address, user_agent, session_id)
  VALUES (_tenant, _country_id, uid, uname, left(_action,50), left(_module,50), left(_entity_type,50), left(_entity_id,100), _details, m.ip, coalesce(left(_device,300), m.ua), m.sid);
END $function$;

CREATE OR REPLACE FUNCTION public.can_write_station(_user_id uuid, _station_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_user_id = auth.uid() OR auth.uid() IS NULL OR public.is_platform_admin(auth.uid())
          OR (public.has_role(auth.uid(),'admin'::app_role) AND public.get_user_tenant(_user_id) = public.get_user_tenant(auth.uid())))
     AND (public.has_role(_user_id, 'admin'::app_role) OR public.has_role(_user_id, 'manager'::app_role)
          OR EXISTS (SELECT 1 FROM public.station_assignments sa WHERE sa.user_id = _user_id AND sa.station_id = _station_id))
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (_user_id = auth.uid() OR auth.uid() IS NULL
          OR EXISTS (SELECT 1 FROM public.platform_admins me WHERE me.user_id = auth.uid()))
     AND EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = _user_id)
$function$;

REVOKE EXECUTE ON FUNCTION public.closure_recompute(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_payment_methods(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_station(uuid, uuid) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "HSE manage checklist items" ON public.hse_checklist_items;
CREATE POLICY "HSE manage checklist items" ON public.hse_checklist_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'hse.manage') OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "HSE manage checklist items update" ON public.hse_checklist_items;
CREATE POLICY "HSE manage checklist items update" ON public.hse_checklist_items AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'hse.manage') OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.has_permission(auth.uid(), 'hse.manage') OR public.is_platform_admin(auth.uid()));