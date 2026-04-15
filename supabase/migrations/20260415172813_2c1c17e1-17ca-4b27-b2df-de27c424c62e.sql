
CREATE OR REPLACE FUNCTION public.check_no_negative_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.super1_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_index_depart'; END IF;
  IF NEW.super1_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_index_arrivee'; END IF;
  IF NEW.super1_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super1_jauge'; END IF;
  IF NEW.super2_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_index_depart'; END IF;
  IF NEW.super2_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_index_arrivee'; END IF;
  IF NEW.super2_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour super2_jauge'; END IF;
  IF NEW.gasoil1_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_index_depart'; END IF;
  IF NEW.gasoil1_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_index_arrivee'; END IF;
  IF NEW.gasoil1_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil1_jauge'; END IF;
  IF NEW.gasoil2_index_depart < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_index_depart'; END IF;
  IF NEW.gasoil2_index_arrivee < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_index_arrivee'; END IF;
  IF NEW.gasoil2_jauge < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour gasoil2_jauge'; END IF;
  IF NEW.versement_momo < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_momo'; END IF;
  IF NEW.versement_banque < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_banque'; END IF;
  IF NEW.versement_liquidite < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour versement_liquidite'; END IF;
  IF NEW.bons_carburant_nombre < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_carburant_nombre'; END IF;
  IF NEW.bons_carburant_valeur < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_carburant_valeur'; END IF;
  IF NEW.bons_entreprise_nombre < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_entreprise_nombre'; END IF;
  IF NEW.bons_entreprise_valeur < 0 THEN RAISE EXCEPTION 'Valeur négative interdite pour bons_entreprise_valeur'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_no_negative_values_trigger
BEFORE INSERT OR UPDATE ON public.index_entries
FOR EACH ROW
EXECUTE FUNCTION public.check_no_negative_values();
