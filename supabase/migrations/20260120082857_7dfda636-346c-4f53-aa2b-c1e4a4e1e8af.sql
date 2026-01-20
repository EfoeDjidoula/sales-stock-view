-- Create orders table for proforma management
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  station_id UUID NOT NULL REFERENCES public.stations(id),
  proforma_number TEXT NOT NULL,
  supplier TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_quantity NUMERIC NOT NULL DEFAULT 0,
  amount_ht NUMERIC NOT NULL DEFAULT 0,
  amount_ttc NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create supplies table for stock replenishment
CREATE TABLE public.supplies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  station_id UUID NOT NULL REFERENCES public.stations(id),
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  reception_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplies ENABLE ROW LEVEL SECURITY;

-- RLS policies for orders
CREATE POLICY "Users can view their own orders"
ON public.orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders"
ON public.orders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own orders"
ON public.orders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own orders"
ON public.orders FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for supplies
CREATE POLICY "Users can view their own supplies"
ON public.supplies FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own supplies"
ON public.supplies FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own supplies"
ON public.supplies FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own supplies"
ON public.supplies FOR DELETE
USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_supplies_updated_at
BEFORE UPDATE ON public.supplies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();