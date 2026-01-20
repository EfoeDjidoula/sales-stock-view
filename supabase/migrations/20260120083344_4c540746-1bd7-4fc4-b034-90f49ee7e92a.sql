-- Add product_type column to orders table
ALTER TABLE public.orders 
ADD COLUMN product_type TEXT NOT NULL DEFAULT 'super';

-- Add product_type column to supplies table  
ALTER TABLE public.supplies
ADD COLUMN product_type TEXT NOT NULL DEFAULT 'super';