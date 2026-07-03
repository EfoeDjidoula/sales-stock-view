CREATE TABLE public.price_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country text NOT NULL DEFAULT 'BJ',
  effective_date date NOT NULL,
  label text,
  super_price numeric NOT NULL DEFAULT 0,
  gasoil_price numeric NOT NULL DEFAULT 0,
  elements jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, effective_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_structures TO authenticated;
GRANT ALL ON public.price_structures TO service_role;

ALTER TABLE public.price_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view price structures"
  ON public.price_structures FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers or owner can insert price structures"
  ON public.price_structures FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "Managers or owner can update price structures"
  ON public.price_structures FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR auth.uid() = user_id)
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR auth.uid() = user_id);

CREATE POLICY "Managers or owner can delete price structures"
  ON public.price_structures FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR auth.uid() = user_id);

CREATE TRIGGER update_price_structures_updated_at
  BEFORE UPDATE ON public.price_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();