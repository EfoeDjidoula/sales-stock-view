-- Add is_active column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Create index for faster filtering
CREATE INDEX idx_profiles_is_active ON public.profiles(is_active);