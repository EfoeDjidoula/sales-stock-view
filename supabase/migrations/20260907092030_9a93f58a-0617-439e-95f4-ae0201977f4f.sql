-- 1. PERMISSIONS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissions readable by authenticated"
  ON public.permissions FOR SELECT TO authenticated USING (true);

-- 2. ROLES ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_code_key
  ON public.roles (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Roles visible in scope" ON public.roles FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Admins manage tenant roles" ON public.roles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY "Admins update tenant roles" ON public.roles FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (NOT is_system AND tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY "Admins delete tenant roles" ON public.roles FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (NOT is_system AND tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 3. ROLE <-> PERMISSIONS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role permissions visible in scope" ON public.role_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id
      AND (r.tenant_id IS NULL OR public.can_access_tenant(auth.uid(), r.tenant_id))
  ));
CREATE POLICY "Admins manage role permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id
      AND (public.is_platform_admin(auth.uid())
        OR (r.tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.roles r WHERE r.id = role_id
      AND (public.is_platform_admin(auth.uid())
        OR (r.tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role)))
  ));

-- 4. AFFECTATION DES ROLES --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments visible in tenant" ON public.user_role_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Admins manage assignments" ON public.user_role_assignments FOR ALL TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 5. SEED PERMISSIONS -------------------------------------------------------
INSERT INTO public.permissions (code, module, action, label)
SELECT m.module || '.' || a.action, m.module, a.action, a.label || ' — ' || m.label
FROM (VALUES
  ('dashboard','Tableau de bord'),('index_entries','Saisie des index'),('stock','Stock'),
  ('depotages','Dépotages'),('orders','Commandes'),('supplies','Approvisionnements'),
  ('clients','Clients'),('suppliers','Fournisseurs'),('trucks','Camions'),
  ('stations','Stations, cuves et pompes'),('perequation','Péréquation'),
  ('price_structures','Structure de prix'),('proforma','Proforma'),
  ('fiscal_years','Exercice comptable'),('users','Utilisateurs et rôles'),
  ('settings','Paramètres société'),('reports','Rapports et exports')
) AS m(module,label)
CROSS JOIN (VALUES
  ('view','Consulter'),('create','Créer'),('edit','Modifier'),('validate','Valider'),
  ('delete','Supprimer'),('export','Exporter'),('administer','Administrer')
) AS a(action,label)
ON CONFLICT (code) DO NOTHING;

-- 6. SEED ROLES SYSTEME -----------------------------------------------------
INSERT INTO public.roles (tenant_id, code, name, description, is_system, position)
VALUES
  (NULL,'client_admin','Administrateur Client','Tous les droits sur sa société',true,1),
  (NULL,'country_director','Directeur Pays','Pilotage complet du périmètre pays',true,2),
  (NULL,'ops_manager','Responsable Exploitation','Exploitation, stocks et logistique',true,3),
  (NULL,'sales_manager','Responsable Commercial','Clients, ventes, proforma et prix',true,4),
  (NULL,'station_manager','Responsable Station','Suivi complet des stations affectées',true,5),
  (NULL,'gerant','Gérant','Saisies quotidiennes de sa station',true,6),
  (NULL,'controller','Contrôleur','Consultation et validation des données',true,7),
  (NULL,'auditor','Auditeur','Consultation et export uniquement',true,8),
  (NULL,'operator','Opérateur','Saisies de base',true,9),
  (NULL,'viewer','Lecture seule','Consultation uniquement',true,10)
ON CONFLICT DO NOTHING;

-- 7. SEED ROLE_PERMISSIONS --------------------------------------------------
WITH matrix(role_code, module, action) AS (
  -- Administrateur Client : tout
  SELECT 'client_admin', p.module, p.action FROM public.permissions p
  UNION ALL
  -- Directeur Pays : tout sauf administration des utilisateurs/paramètres
  SELECT 'country_director', p.module, p.action FROM public.permissions p
    WHERE NOT (p.action = 'administer' AND p.module IN ('users','settings'))
  UNION ALL
  -- Responsable Exploitation
  SELECT 'ops_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('index_entries','stock','depotages','orders','supplies','trucks','stations','perequation','fiscal_years')
      AND p.action <> 'administer'
  UNION ALL
  SELECT 'ops_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('dashboard','reports','clients','suppliers','price_structures') AND p.action IN ('view','export')
  UNION ALL
  -- Responsable Commercial
  SELECT 'sales_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('clients','suppliers','orders','proforma','price_structures')
      AND p.action IN ('view','create','edit','export')
  UNION ALL
  SELECT 'sales_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('dashboard','stock','reports') AND p.action IN ('view','export')
  UNION ALL
  -- Responsable Station
  SELECT 'station_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('index_entries','stock','depotages','supplies')
      AND p.action IN ('view','create','edit','export','validate')
  UNION ALL
  SELECT 'station_manager', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('dashboard','stations','trucks','reports') AND p.action IN ('view','export')
  UNION ALL
  -- Gérant
  SELECT 'gerant', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('index_entries','depotages') AND p.action IN ('view','create','edit')
  UNION ALL
  SELECT 'gerant', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('dashboard','stock','stations') AND p.action = 'view'
  UNION ALL
  -- Contrôleur
  SELECT 'controller', p.module, p.action FROM public.permissions p
    WHERE p.action IN ('view','validate','export')
  UNION ALL
  -- Auditeur
  SELECT 'auditor', p.module, p.action FROM public.permissions p WHERE p.action IN ('view','export')
  UNION ALL
  -- Opérateur
  SELECT 'operator', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('index_entries','depotages') AND p.action IN ('view','create')
  UNION ALL
  SELECT 'operator', p.module, p.action FROM public.permissions p
    WHERE p.module IN ('dashboard','stock') AND p.action = 'view'
  UNION ALL
  -- Lecture seule
  SELECT 'viewer', p.module, p.action FROM public.permissions p WHERE p.action = 'view'
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT r.id, p.id
FROM matrix m
JOIN public.roles r ON r.code = m.role_code AND r.tenant_id IS NULL
JOIN public.permissions p ON p.module = m.module AND p.action = m.action
ON CONFLICT DO NOTHING;

-- 8. MIGRATION DES UTILISATEURS EXISTANTS -----------------------------------
INSERT INTO public.user_role_assignments (user_id, tenant_id, role_id)
SELECT pr.user_id, pr.tenant_id, r.id
FROM public.profiles pr
JOIN public.user_roles ur ON ur.user_id = pr.user_id
JOIN public.roles r ON r.tenant_id IS NULL AND r.code = CASE ur.role
    WHEN 'admin'::app_role THEN 'client_admin'
    WHEN 'manager'::app_role THEN 'ops_manager'
    ELSE 'operator' END
WHERE pr.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_country_access (user_id, tenant_id, country_id)
SELECT pr.user_id, pr.tenant_id, pr.country_id
FROM public.profiles pr
WHERE pr.tenant_id IS NOT NULL AND pr.country_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 9. FONCTION DE CONTROLE DES PERMISSIONS -----------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.role_permissions rp ON rp.role_id = ura.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ura.user_id = _user_id
        AND p.code = _permission_code
    )
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS TABLE (code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.code FROM public.permissions p
  WHERE public.is_platform_admin(_user_id)
  UNION
  SELECT DISTINCT p.code
  FROM public.user_role_assignments ura
  JOIN public.role_permissions rp ON rp.role_id = ura.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ura.user_id = _user_id
$$;
REVOKE ALL ON FUNCTION public.get_user_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated, service_role;