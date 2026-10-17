INSERT INTO public.permissions (code, module, action, label)
VALUES ('hse.manage', 'hse', 'administer', 'Gérer les agents HSE')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, (SELECT id FROM public.permissions WHERE code = 'hse.manage')
FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
WHERE p.code = 'stations.administer'
ON CONFLICT DO NOTHING;

CREATE TABLE public.hse_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  full_name text NOT NULL,
  job_title text,
  phone text,
  email text,
  user_id uuid,
  certification text,
  certification_expires_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hse_agents TO authenticated;
GRANT ALL ON public.hse_agents TO service_role;
ALTER TABLE public.hse_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped read" ON public.hse_agents FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Strict tenant country isolation" ON public.hse_agents AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Module gate" ON public.hse_agents AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, 'stations')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, 'stations'));
CREATE POLICY "HSE managers insert" ON public.hse_agents FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'hse.manage') AND public.tenant_write_allowed(tenant_id));
CREATE POLICY "HSE managers update" ON public.hse_agents FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'hse.manage') AND public.tenant_write_allowed(tenant_id));
CREATE TRIGGER no_delete BEFORE DELETE ON public.hse_agents FOR EACH ROW EXECUTE FUNCTION public.logistics_no_delete();
CREATE TRIGGER touch BEFORE UPDATE ON public.hse_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER audit AFTER INSERT OR UPDATE ON public.hse_agents FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER scope_guard BEFORE INSERT OR UPDATE ON public.hse_agents FOR EACH ROW EXECUTE FUNCTION public.hse_scope_guard();

ALTER TABLE public.hse_inspections ADD COLUMN agent_id uuid REFERENCES public.hse_agents(id);
ALTER TABLE public.hse_events ADD COLUMN agent_id uuid REFERENCES public.hse_agents(id);

CREATE OR REPLACE FUNCTION public.hse_agent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.agent_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.agent_id IS DISTINCT FROM OLD.agent_id) THEN
    IF NOT EXISTS (SELECT 1 FROM hse_agents a WHERE a.id = NEW.agent_id AND a.tenant_id = NEW.tenant_id AND a.country_id = NEW.country_id AND a.status = 'active') THEN
      RAISE EXCEPTION 'Agent HSE inactif ou rattaché à une autre société/pays';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_guard BEFORE INSERT OR UPDATE ON public.hse_inspections FOR EACH ROW EXECUTE FUNCTION public.hse_agent_guard();
CREATE TRIGGER agent_guard BEFORE INSERT OR UPDATE ON public.hse_events FOR EACH ROW EXECUTE FUNCTION public.hse_agent_guard();