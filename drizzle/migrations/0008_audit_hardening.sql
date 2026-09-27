-- 1. Colonnes réservées au Super Admin sur tenants
CREATE OR REPLACE FUNCTION public.protect_tenant_admin_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.slug IS DISTINCT FROM OLD.slug OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.show_powered_by IS DISTINCT FROM OLD.show_powered_by
     OR NEW.powered_by_label IS DISTINCT FROM OLD.powered_by_label THEN
    RAISE EXCEPTION 'Seul le Super Admin LUMATEK peut modifier le statut, le plan ou la mention Powered by';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_tenant_admin_columns ON public.tenants;
CREATE TRIGGER trg_protect_tenant_admin_columns BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.protect_tenant_admin_columns();

-- 2. Profil : un utilisateur ne peut pas changer sa société, son pays ni son statut
CREATE OR REPLACE FUNCTION public.protect_profile_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.country_id IS DISTINCT FROM OLD.country_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND NOT (public.has_permission(auth.uid(), 'users.administer') AND NEW.user_id <> auth.uid()
              AND NEW.tenant_id = OLD.tenant_id) THEN
    RAISE EXCEPTION 'Modification du rattachement société/pays/statut non autorisée';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_profile_scope ON public.profiles;
CREATE TRIGGER trg_protect_profile_scope BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_scope();

-- 3. Affectation des pays à une société : Super Admin uniquement
DROP POLICY IF EXISTS "Admins can insert tenant countries" ON public.tenant_countries;
DROP POLICY IF EXISTS "Admins can update tenant countries" ON public.tenant_countries;
DROP POLICY IF EXISTS "Admins can delete tenant countries" ON public.tenant_countries;

-- 4. Permissions d'un autre utilisateur : uniquement soi-même, même société ou Super Admin
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE(code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT auth.uid() IS NULL OR _user_id = auth.uid()
      OR public.is_platform_admin(auth.uid())
      OR public.shares_tenant_with(auth.uid(), _user_id) AS ok
  )
  SELECT p.code FROM public.permissions p, allowed WHERE allowed.ok AND public.is_platform_admin(_user_id)
  UNION
  SELECT DISTINCT p.code
  FROM public.user_role_assignments ura
  JOIN public.role_permissions rp ON rp.role_id = ura.role_id
  JOIN public.permissions p ON p.id = rp.permission_id, allowed
  WHERE allowed.ok AND ura.user_id = _user_id
$$;

-- 5. Fonctions internes non appelables sans connexion
REVOKE EXECUTE ON FUNCTION public.is_module_enabled(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tenant_license_limits(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_license_limits() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.support_ticket_before() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.support_ticket_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.support_event_after() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_tenant_admin_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_module_enabled(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_license_limits(uuid) TO authenticated, service_role;