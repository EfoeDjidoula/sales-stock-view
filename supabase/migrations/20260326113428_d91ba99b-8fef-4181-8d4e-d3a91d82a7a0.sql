
-- Function to check if fiscal year is open for a given date
CREATE OR REPLACE FUNCTION public.check_fiscal_year_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year integer;
  _status text;
  _is_admin boolean;
BEGIN
  _year := EXTRACT(YEAR FROM NEW.entry_date);
  
  -- Check if user is admin (admins bypass the lock)
  _is_admin := has_role(NEW.user_id, 'admin'::app_role);
  IF _is_admin THEN
    RETURN NEW;
  END IF;
  
  -- Check fiscal year status
  SELECT status INTO _status
  FROM public.fiscal_years
  WHERE year = _year;
  
  -- If no fiscal year exists, allow (no restriction)
  IF _status IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- If fiscal year is closed, block the operation
  IF _status = 'closed' THEN
    RAISE EXCEPTION 'L''exercice comptable % est clôturé. Contactez un administrateur pour le réouvrir.', _year;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on INSERT
CREATE TRIGGER check_fiscal_year_on_insert
  BEFORE INSERT ON public.index_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_fiscal_year_open();

-- Trigger on UPDATE
CREATE TRIGGER check_fiscal_year_on_update
  BEFORE UPDATE ON public.index_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_fiscal_year_open();
