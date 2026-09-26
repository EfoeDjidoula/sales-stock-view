CREATE POLICY "Platform admins manage contract documents" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'contract-documents' AND public.is_platform_admin(auth.uid()))
  WITH CHECK (bucket_id = 'contract-documents' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "Tenant members read own contract documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contract-documents' AND public.can_access_tenant(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE TABLE public.contract_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('FAC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  contract_id uuid NOT NULL REFERENCES public.maintenance_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_month integer NOT NULL CHECK (invoice_month BETWEEN 1 AND 12),
  invoice_year integer NOT NULL CHECK (invoice_year BETWEEN 2000 AND 2100),
  amount numeric NOT NULL CHECK (amount > 0),
  amount_paid numeric NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contract_invoices(contract_id);
CREATE INDEX ON public.contract_invoices(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_invoices TO authenticated;
GRANT ALL ON public.contract_invoices TO service_role;
ALTER TABLE public.contract_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage invoices" ON public.contract_invoices FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Tenant members read invoices" ON public.contract_invoices FOR SELECT TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id));
CREATE TRIGGER trg_contract_invoices_updated BEFORE UPDATE ON public.contract_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();