-- Create stations table
CREATE TABLE public.stations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on stations
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

-- Stations are publicly readable (reference data)
CREATE POLICY "Stations are viewable by authenticated users"
  ON public.stations FOR SELECT
  TO authenticated
  USING (true);

-- Insert the 9 stations
INSERT INTO public.stations (name, location) VALUES
  ('Station Cotonou Centre', 'Cotonou'),
  ('Station Porto-Novo', 'Porto-Novo'),
  ('Station Parakou', 'Parakou'),
  ('Station Bohicon', 'Bohicon'),
  ('Station Abomey-Calavi', 'Abomey-Calavi'),
  ('Station Lokossa', 'Lokossa'),
  ('Station Natitingou', 'Natitingou'),
  ('Station Djougou', 'Djougou'),
  ('Station Kandi', 'Kandi');

-- Create index entries table
CREATE TABLE public.index_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  
  -- Super indexes
  super1_index_depart NUMERIC NOT NULL DEFAULT 0,
  super1_index_arrivee NUMERIC NOT NULL DEFAULT 0,
  super1_jauge NUMERIC NOT NULL DEFAULT 0,
  super2_index_depart NUMERIC NOT NULL DEFAULT 0,
  super2_index_arrivee NUMERIC NOT NULL DEFAULT 0,
  super2_jauge NUMERIC NOT NULL DEFAULT 0,
  
  -- Gasoil indexes
  gasoil1_index_depart NUMERIC NOT NULL DEFAULT 0,
  gasoil1_index_arrivee NUMERIC NOT NULL DEFAULT 0,
  gasoil1_jauge NUMERIC NOT NULL DEFAULT 0,
  gasoil2_index_depart NUMERIC NOT NULL DEFAULT 0,
  gasoil2_index_arrivee NUMERIC NOT NULL DEFAULT 0,
  gasoil2_jauge NUMERIC NOT NULL DEFAULT 0,
  
  -- Versements
  versement_momo NUMERIC NOT NULL DEFAULT 0,
  versement_momo_ref TEXT,
  versement_banque NUMERIC NOT NULL DEFAULT 0,
  versement_banque_ref TEXT,
  versement_liquidite NUMERIC NOT NULL DEFAULT 0,
  versement_liquidite_note TEXT,
  
  -- Bons de valeur
  bons_carburant_nombre INTEGER NOT NULL DEFAULT 0,
  bons_carburant_valeur NUMERIC NOT NULL DEFAULT 0,
  bons_entreprise_nombre INTEGER NOT NULL DEFAULT 0,
  bons_entreprise_valeur NUMERIC NOT NULL DEFAULT 0,
  
  -- Calculated totals (for quick querying)
  total_super_liters NUMERIC GENERATED ALWAYS AS (
    (super1_index_arrivee - super1_index_depart) + (super2_index_arrivee - super2_index_depart)
  ) STORED,
  total_gasoil_liters NUMERIC GENERATED ALWAYS AS (
    (gasoil1_index_arrivee - gasoil1_index_depart) + (gasoil2_index_arrivee - gasoil2_index_depart)
  ) STORED,
  total_versements NUMERIC GENERATED ALWAYS AS (
    versement_momo + versement_banque + versement_liquidite
  ) STORED,
  total_bons NUMERIC GENERATED ALWAYS AS (
    (bons_carburant_nombre * bons_carburant_valeur) + (bons_entreprise_nombre * bons_entreprise_valeur)
  ) STORED,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint: one entry per station per day per user
  UNIQUE (user_id, station_id, entry_date)
);

-- Enable RLS on index_entries
ALTER TABLE public.index_entries ENABLE ROW LEVEL SECURITY;

-- Users can view their own entries
CREATE POLICY "Users can view their own index entries"
  ON public.index_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own entries
CREATE POLICY "Users can create their own index entries"
  ON public.index_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own entries
CREATE POLICY "Users can update their own index entries"
  ON public.index_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own entries
CREATE POLICY "Users can delete their own index entries"
  ON public.index_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create profiles table for user info
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for index_entries updated_at
CREATE TRIGGER update_index_entries_updated_at
  BEFORE UPDATE ON public.index_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_index_entries_user_id ON public.index_entries(user_id);
CREATE INDEX idx_index_entries_station_id ON public.index_entries(station_id);
CREATE INDEX idx_index_entries_entry_date ON public.index_entries(entry_date DESC);