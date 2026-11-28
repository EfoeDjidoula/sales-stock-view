DO $$ DECLARE def text; r record; q text; w text; BEGIN
SELECT pg_get_functiondef('public.rbac_assign_role(uuid,uuid)'::regprocedure) INTO def;
def:=replace(def,'INSERT INTO public.user_roles(user_id,role) VALUES(_user,public.rbac_legacy_role(_role)) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role;', 'DELETE FROM public.user_roles WHERE user_id=_user; INSERT INTO public.user_roles(user_id,role) VALUES(_user,public.rbac_legacy_role(_role));'); EXECUTE def;
FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND (policyname LIKE 'Granular action%' OR policyname LIKE 'Exact action%' OR policyname LIKE 'Permission administration%' OR policyname IN ('Read users by permission','Read assignments by permission')) LOOP
q:=replace(r.qual,'auth.uid()','(select auth.uid())'); w:=replace(r.with_check,'auth.uid()','(select auth.uid())');
IF q IS NOT NULL AND w IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',r.policyname,r.tablename,q,w);
ELSIF q IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',r.policyname,r.tablename,q);
ELSIF w IS NOT NULL THEN EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',r.policyname,r.tablename,w); END IF;
END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.rbac_protect_own_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_role_assignments WHERE user_id=auth.uid() AND role_id=OLD.role_id) AND EXISTS(SELECT 1 FROM public.permissions WHERE id=OLD.permission_id AND code='users.administer') THEN
IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre administration'; ELSIF NEW.permission_id IS DISTINCT FROM OLD.permission_id OR NEW.role_id IS DISTINCT FROM OLD.role_id THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre administration'; END IF;
END IF; IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END $$;
CREATE TRIGGER rbac_protect_own_admin BEFORE UPDATE OR DELETE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.rbac_protect_own_admin();
