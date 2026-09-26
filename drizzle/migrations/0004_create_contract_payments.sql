CREATE TABLE public.contract_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.maintenance_contracts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_month INTEGER NOT NULL CHECK (payment_month BETWEEN 1 AND 12),
  payment_year INTEGER NOT NULL CHECK (payment_year BETWEEN 2000 AND 2100),
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_payments_contract ON public.contract_payments(contract_id);
CREATE INDEX idx_contract_payments_tenant ON public.contract_payments(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;

ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage contract payments"
ON public.contract_payments FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Tenant members read own contract payments"
ON public.contract_payments FOR SELECT TO authenticated
USING (public.can_access_tenant(auth.uid(), tenant_id));

CREATE TRIGGER update_contract_payments_updated_at
BEFORE UPDATE ON public.contract_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();