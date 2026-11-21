CREATE TABLE public.account_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  reference text NOT NULL,
  motif text NOT NULL CHECK (motif IN ('periodique','prix','gerance')),
  gerant text NOT NULL,
  gerant_entrant text,
  date_reprise date,
  prev_control date NOT NULL,
  control_date date NOT NULL,
  include_pending boolean NOT NULL DEFAULT false,
  price_super numeric NOT NULL CHECK (price_super >= 0),
  price_gasoil numeric NOT NULL CHECK (price_gasoil >= 0),
  tank_gauges jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'valide' CHECK (status IN ('valide','annule')),
  validated_by uuid NOT NULL,
  validated_by_name text,
  validated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid,
  cancelled_by_name text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (control_date > prev_control)
);
CREATE INDEX account_closings_station_idx ON public.account_closings (station_id, control_date DESC);
CREATE UNIQUE INDEX account_closings_station_control_uniq ON public.account_closings (station_id, control_date) WHERE status = 'valide';

CREATE TABLE public.account_closing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id uuid NOT NULL REFERENCES public.account_closings(id),
  tenant_id uuid NOT NULL,
  country_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_closings TO authenticated;
GRANT ALL ON public.account_closings TO service_role;
GRANT SELECT ON public.account_closing_events TO authenticated;
GRANT ALL ON public.account_closing_events TO service_role;

ALTER TABLE public.account_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_closing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scope gate" ON public.account_closings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))
  WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Scope read" ON public.account_closings FOR SELECT TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Scope gate" ON public.account_closing_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))
  WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));
CREATE POLICY "Scope read" ON public.account_closing_events FOR SELECT TO authenticated
  USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

-- Verrou : aucune modification hors annulation par la fonction dédiée, aucune suppression
CREATE OR REPLACE FUNCTION public.account_closing_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Un arrêté des comptes ne peut pas être supprimé'; END IF;
  IF coalesce(current_setting('lumatek.closing_action', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Arrêté des comptes verrouillé';
  END IF;
  IF OLD.status <> 'valide' OR NEW.status <> 'annule'
     OR (to_jsonb(NEW) - ARRAY['status','cancelled_by','cancelled_by_name','cancelled_at','cancel_reason'])
        <> (to_jsonb(OLD) - ARRAY['status','cancelled_by','cancelled_by_name','cancelled_at','cancel_reason']) THEN
    RAISE EXCEPTION 'Seule l''annulation d''un arrêté validé est autorisée';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_closing_lock BEFORE UPDATE OR DELETE ON public.account_closings
  FOR EACH ROW EXECUTE FUNCTION public.account_closing_lock();

CREATE OR REPLACE FUNCTION public.account_closing_events_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Journal des arrêtés non modifiable'; END $$;
CREATE TRIGGER account_closing_events_immutable BEFORE UPDATE OR DELETE ON public.account_closing_events
  FOR EACH ROW EXECUTE FUNCTION public.account_closing_events_immutable();

CREATE OR REPLACE FUNCTION public.account_closing_action(_action text, _data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); d jsonb := COALESCE(_data, '{}'::jsonb);
  st record; c record; last_ctrl date; new_id uuid; uname text; ref text;
  _prev date; _ctrl date; _motif text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  SELECT full_name INTO uname FROM public.profiles WHERE user_id = uid;

  IF _action = 'validate' THEN
    SELECT id, tenant_id, country_id, name INTO st FROM public.stations WHERE id = (d->>'station_id')::uuid;
    IF st.id IS NULL OR NOT public.can_access_tenant_country(uid, st.tenant_id, st.country_id) THEN RAISE EXCEPTION 'Station introuvable'; END IF;
    IF NOT public.tenant_write_allowed(st.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
    IF NOT (public.is_platform_admin(uid) OR public.has_permission(uid, 'reports.validate')) THEN
      RAISE EXCEPTION 'Droit « Valider — Rapports » requis pour archiver un arrêté';
    END IF;
    _prev := (d->>'prev_control')::date; _ctrl := (d->>'control_date')::date; _motif := d->>'motif';
    IF _prev IS NULL OR _ctrl IS NULL OR _ctrl <= _prev THEN RAISE EXCEPTION 'La date du contrôle doit suivre la date du contrôle précédent'; END IF;
    IF _ctrl > (now() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'La date du contrôle ne peut pas être future'; END IF;
    IF _motif NOT IN ('periodique','prix','gerance') THEN RAISE EXCEPTION 'Motif invalide'; END IF;
    IF COALESCE(btrim(d->>'gerant'), '') = '' THEN RAISE EXCEPTION 'Le nom du gérant est obligatoire'; END IF;
    IF _motif = 'gerance' AND COALESCE(btrim(d->>'gerant_entrant'), '') = '' THEN RAISE EXCEPTION 'Le nom du gérant entrant est obligatoire pour une passation'; END IF;
    IF COALESCE((d->>'price_super')::numeric, -1) < 0 OR COALESCE((d->>'price_gasoil')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Prix retenus invalides'; END IF;
    SELECT max(control_date) INTO last_ctrl FROM public.account_closings WHERE station_id = st.id AND status = 'valide';
    IF last_ctrl IS NOT NULL AND _prev <> last_ctrl THEN
      RAISE EXCEPTION 'Le contrôle précédent doit être celui du dernier arrêté validé (%)', to_char(last_ctrl, 'DD/MM/YYYY');
    END IF;
    ref := 'ARR-' || to_char(_ctrl, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.account_closings (tenant_id, country_id, station_id, reference, motif, gerant, gerant_entrant, date_reprise,
      prev_control, control_date, include_pending, price_super, price_gasoil, tank_gauges, totals, snapshot, validated_by, validated_by_name)
    VALUES (st.tenant_id, st.country_id, st.id, ref, _motif, btrim(d->>'gerant'), NULLIF(btrim(d->>'gerant_entrant'), ''),
      NULLIF(d->>'date_reprise', '')::date, _prev, _ctrl, COALESCE((d->>'include_pending')::boolean, false),
      (d->>'price_super')::numeric, (d->>'price_gasoil')::numeric,
      COALESCE(d->'tank_gauges', '{}'::jsonb), COALESCE(d->'totals', '{}'::jsonb), COALESCE(d->'snapshot', '{}'::jsonb), uid, uname)
    RETURNING id INTO new_id;
    INSERT INTO public.account_closing_events (closing_id, tenant_id, country_id, action, author_id, author_name)
    VALUES (new_id, st.tenant_id, st.country_id, 'validate', uid, uname);
    RETURN new_id;

  ELSIF _action = 'cancel' THEN
    SELECT * INTO c FROM public.account_closings WHERE id = (d->>'id')::uuid FOR UPDATE;
    IF c.id IS NULL OR NOT public.can_access_tenant_country(uid, c.tenant_id, c.country_id) THEN RAISE EXCEPTION 'Arrêté introuvable'; END IF;
    IF NOT public.tenant_write_allowed(c.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
    IF NOT (public.is_platform_admin(uid) OR public.has_permission(uid, 'reports.administer')) THEN
      RAISE EXCEPTION 'Droit « Administrer — Rapports » requis pour annuler un arrêté';
    END IF;
    IF c.status <> 'valide' THEN RAISE EXCEPTION 'Arrêté déjà annulé'; END IF;
    IF COALESCE(btrim(d->>'reason'), '') = '' THEN RAISE EXCEPTION 'Un motif d''annulation est obligatoire'; END IF;
    IF EXISTS (SELECT 1 FROM public.account_closings WHERE station_id = c.station_id AND status = 'valide' AND control_date > c.control_date) THEN
      RAISE EXCEPTION 'Seul le dernier arrêté validé de la station peut être annulé';
    END IF;
    PERFORM set_config('lumatek.closing_action', 'on', true);
    UPDATE public.account_closings SET status = 'annule', cancelled_by = uid, cancelled_by_name = uname,
      cancelled_at = now(), cancel_reason = btrim(d->>'reason') WHERE id = c.id;
    PERFORM set_config('lumatek.closing_action', 'off', true);
    INSERT INTO public.account_closing_events (closing_id, tenant_id, country_id, action, reason, author_id, author_name)
    VALUES (c.id, c.tenant_id, c.country_id, 'cancel', btrim(d->>'reason'), uid, uname);
    RETURN c.id;
  END IF;
  RAISE EXCEPTION 'Action inconnue %', _action;
END $$;
REVOKE EXECUTE ON FUNCTION public.account_closing_action(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_closing_action(text, jsonb) TO authenticated;