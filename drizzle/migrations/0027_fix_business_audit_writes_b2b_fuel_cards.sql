CREATE OR REPLACE FUNCTION public.audit_business_event(_action text, _module text, _entity_type text, _entity_id text, _country_id uuid, _details jsonb, _device text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); m record; uname text; _tenant uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT full_name, tenant_id INTO uname, _tenant FROM public.profiles WHERE user_id = uid LIMIT 1;
  SELECT * INTO m FROM public.audit_request_meta();
  INSERT INTO public.audit_logs(tenant_id, country_id, user_id, user_name, action, module, entity_type, entity_id, new_value, ip_address, user_agent, session_id)
  VALUES (_tenant, _country_id, uid, uname, left(_action,50), left(_module,50), left(_entity_type,50), left(_entity_id,100), _details, m.ip, coalesce(left(_device,300), m.ua), m.sid);
END $$;
REVOKE ALL ON FUNCTION public.audit_business_event(text,text,text,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;

DO $$ DECLARE d text; f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.b2b_action','public.fuel_card_action'] LOOP
    SELECT pg_get_functiondef(f::regproc) INTO d;
    EXECUTE replace(d, 'public.log_audit_event(', 'public.audit_business_event(');
  END LOOP;
END $$;