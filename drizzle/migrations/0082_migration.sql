DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.hse_action(text,uuid,text,text,jsonb)'::regprocedure);
  d := replace(d, 'UPDATE hse_inspections SET status = ''submitted'', score = coalesce(s, 100),',
    'IF s IS NULL THEN RAISE EXCEPTION ''Aucun point de contrôle applicable : score impossible''; END IF;
      UPDATE hse_inspections SET status = ''submitted'', score = s,');
  IF position('score = s,' in d) = 0 THEN RAISE EXCEPTION 'hse_action patch failed'; END IF;
  EXECUTE d;

  d := pg_get_functiondef('public.closure_transition(uuid,text,text)'::regprocedure);
  d := replace(d, '    new_status := CASE _action WHEN ''validate''',
    '    IF _action = ''validate'' AND c.submitted_by = uid THEN RAISE EXCEPTION ''La validation doit être faite par une autre personne que celle qui a soumis''; END IF;
    IF _action = ''validate'' AND EXISTS (SELECT 1 FROM public.closure_sales WHERE closure_id = _id AND volume_mode <> ''index'')
       AND EXISTS (SELECT 1 FROM public.closure_events WHERE closure_id = _id AND author_id = uid) THEN
      RAISE EXCEPTION ''Volumes manuels : le validateur ne doit pas avoir participé à la saisie'';
    END IF;
    new_status := CASE _action WHEN ''validate''');
  IF position('autre personne que celle qui a soumis' in d) = 0 THEN RAISE EXCEPTION 'closure_transition patch failed'; END IF;
  EXECUTE d;
END $mig$;

CREATE OR REPLACE FUNCTION public.hse_event_date_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.occurred_at IS NOT NULL AND NEW.occurred_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'La date de l''événement ne peut pas être dans le futur';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS hse_event_date_guard ON public.hse_events;
CREATE TRIGGER hse_event_date_guard BEFORE INSERT OR UPDATE OF occurred_at ON public.hse_events
FOR EACH ROW EXECUTE FUNCTION public.hse_event_date_guard();