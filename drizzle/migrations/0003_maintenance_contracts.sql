CREATE TABLE public.maintenance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text NOT NULL UNIQUE DEFAULT ('MC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contract_type text NOT NULL DEFAULT 'standard',
  signature_date date,
  start_date date NOT NULL,
  end_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  billing_frequency text NOT NULL DEFAULT 'annual' CHECK (billing_frequency IN ('monthly','quarterly','semiannual','annual','one_time')),
  sla text,
  support_level text NOT NULL DEFAULT 'standard',
  client_contact text,
  lumatek_manager text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewal_due','expired','suspended','terminated')),
  document_url text,
  notes text,
  previous_contract_id uuid REFERENCES public.maintenance_contracts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX maintenance_contracts_tenant_idx ON public.maintenance_contracts(tenant_id);
GRANT SELECT ON public.maintenance_contracts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.maintenance_contracts TO authenticated;
GRANT ALL ON public.maintenance_contracts TO service_role;
ALTER TABLE public.maintenance_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage contracts" ON public.maintenance_contracts FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Tenant members read own contracts" ON public.maintenance_contracts FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));
CREATE TRIGGER maintenance_contracts_updated BEFORE UPDATE ON public.maintenance_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();