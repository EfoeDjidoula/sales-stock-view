CREATE OR REPLACE FUNCTION public.rbac_legacy_role(_role uuid) RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=_role AND p.code='users.administer') THEN 'admin'::public.app_role WHEN EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=_role AND p.action IN ('create','edit','validate','administer','manage')) THEN 'manager'::public.app_role ELSE 'operator'::public.app_role END $$;
REVOKE ALL ON FUNCTION public.rbac_legacy_role(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.rbac_legacy_role(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.rbac_assign_role(_user uuid,_role uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t uuid; r public.roles; BEGIN
PERFORM public.rbac_require_permission('users.administer'); SELECT tenant_id INTO t FROM public.profiles WHERE user_id=_user FOR UPDATE;
IF t IS NULL OR (NOT public.is_platform_admin(auth.uid()) AND t IS DISTINCT FROM public.get_user_tenant(auth.uid())) THEN RAISE EXCEPTION 'Utilisateur hors de votre société'; END IF;
IF _role IS NOT NULL THEN SELECT * INTO r FROM public.roles WHERE id=_role; IF r.id IS NULL OR (r.tenant_id IS NOT NULL AND r.tenant_id<>t) THEN RAISE EXCEPTION 'Profil hors de votre société'; END IF; END IF;
IF _user=auth.uid() AND (_role IS NULL OR NOT EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=_role AND p.code='users.administer')) THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre administration'; END IF;
DELETE FROM public.user_role_assignments WHERE user_id=_user AND tenant_id=t;
IF _role IS NULL THEN DELETE FROM public.user_roles WHERE user_id=_user; ELSE INSERT INTO public.user_role_assignments(user_id,tenant_id,role_id) VALUES(_user,t,_role); INSERT INTO public.user_roles(user_id,role) VALUES(_user,public.rbac_legacy_role(_role)) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role; END IF;
PERFORM public.audit_business_event('role_assigned','users','user',_user::text,NULL,jsonb_build_object('role',_role),NULL); END $$;
REVOKE ALL ON FUNCTION public.rbac_assign_role(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.rbac_assign_role(uuid,uuid) TO authenticated,service_role;
DO $$ DECLARE r record; a text; cmd text; BEGIN
-- Preserve the formerly bundled write capability, then make each checkbox authoritative.
FOR r IN SELECT DISTINCT tablename, substring(COALESCE(qual,with_check) FROM '''([a-z_]+)''') module FROM pg_policies WHERE schemaname='public' AND policyname='RBAC write insert' LOOP
IF r.module IS NOT NULL THEN
INSERT INTO public.role_permissions(role_id,permission_id) SELECT DISTINCT rp.role_id,p.id FROM public.permissions p JOIN public.permissions source ON source.module=r.module AND source.action IN ('create','edit','validate','delete','administer') JOIN public.role_permissions rp ON rp.permission_id=source.id WHERE p.module=r.module AND p.action IN ('create','edit','delete') ON CONFLICT DO NOTHING;
FOREACH cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP a:=CASE cmd WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'edit' ELSE 'delete' END;
IF EXISTS(SELECT 1 FROM public.permissions WHERE code=r.module||'.'||a) THEN
IF cmd='INSERT' THEN EXECUTE format('CREATE POLICY "Exact action insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.has_permission(auth.uid(),%L))',r.tablename,r.module||'.'||a);
ELSIF cmd='UPDATE' THEN EXECUTE format('CREATE POLICY "Exact action update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.has_permission(auth.uid(),%L)) WITH CHECK(public.has_permission(auth.uid(),%L))',r.tablename,r.module||'.'||a,r.module||'.'||a);
ELSE EXECUTE format('CREATE POLICY "Exact action delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.has_permission(auth.uid(),%L))',r.tablename,r.module||'.'||a); END IF;
END IF; END LOOP; END IF;
END LOOP;
FOR r IN SELECT unnest(ARRAY['roles','role_permissions','user_role_assignments','user_roles','user_country_access','station_assignments']) tbl LOOP
EXECUTE format('CREATE POLICY "Permission administration insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.has_permission(auth.uid(),''users.administer''))',r.tbl);
EXECUTE format('CREATE POLICY "Permission administration update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.has_permission(auth.uid(),''users.administer'')) WITH CHECK(public.has_permission(auth.uid(),''users.administer''))',r.tbl);
EXECUTE format('CREATE POLICY "Permission administration delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.has_permission(auth.uid(),''users.administer''))',r.tbl);
END LOOP; END $$;
CREATE POLICY "Read users by permission" ON public.profiles FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'users.view') AND tenant_id=public.get_user_tenant(auth.uid()));
CREATE POLICY "Read assignments by permission" ON public.user_role_assignments FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'users.view') AND tenant_id=public.get_user_tenant(auth.uid()));
