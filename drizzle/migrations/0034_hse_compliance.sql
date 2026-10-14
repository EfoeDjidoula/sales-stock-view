CREATE TABLE public.hse_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  checklist_id uuid NOT NULL REFERENCES public.hse_checklists(id),
  label text NOT NULL,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_critical boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  checklist_id uuid NOT NULL REFERENCES public.hse_checklists(id),
  inspected_on date NOT NULL DEFAULT current_date,
  inspector text,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','validated','rejected')),
  score numeric,
  submitted_by uuid, submitted_at timestamptz,
  validated_by uuid, validated_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_inspection_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  inspection_id uuid NOT NULL REFERENCES public.hse_inspections(id),
  item_id uuid NOT NULL REFERENCES public.hse_checklist_items(id),
  result text NOT NULL CHECK (result IN ('ok','nok','na')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, item_id)
);
CREATE TABLE public.hse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  kind text NOT NULL CHECK (kind IN ('incident','accident','near_miss','fire_drill')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text,
  injuries integer NOT NULL DEFAULT 0 CHECK (injuries >= 0),
  immediate_actions text,
  responsible text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_safety_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  kind text NOT NULL CHECK (kind IN ('extinguisher','ppe','spill_kit','other')),
  label text NOT NULL,
  reference text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  last_check_on date,
  next_check_on date,
  expires_on date,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','to_replace','retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_nonconformities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  inspection_id uuid REFERENCES public.hse_inspections(id),
  item_id uuid REFERENCES public.hse_checklist_items(id),
  event_id uuid REFERENCES public.hse_events(id),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'major' CHECK (severity IN ('minor','major','critical')),
  corrective_action text,
  responsible text,
  due_on date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_validation','closed')),
  closure_proof text,
  closure_attachment text,
  closure_submitted_by uuid, closure_submitted_at timestamptz,
  closed_by uuid, closed_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  entity_type text NOT NULL CHECK (entity_type IN ('inspection','event','nonconformity','safety_item')),
  entity_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.hse_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  comment text,
  details jsonb,
  actor_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.hse_checklists, public.hse_checklist_items, public.hse_inspections, public.hse_inspection_answers, public.hse_events, public.hse_safety_items, public.hse_nonconformities TO authenticated;
GRANT SELECT, INSERT ON public.hse_attachments TO authenticated;
GRANT SELECT ON public.hse_history TO authenticated;
GRANT ALL ON public.hse_checklists, public.hse_checklist_items, public.hse_inspections, public.hse_inspection_answers, public.hse_events, public.hse_safety_items, public.hse_nonconformities, public.hse_attachments, public.hse_history TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hse_checklists','hse_checklist_items','hse_inspections','hse_inspection_answers','hse_events','hse_safety_items','hse_nonconformities','hse_attachments','hse_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Strict tenant country isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)) WITH CHECK (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE POLICY "Module gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_module_enabled(tenant_id, country_id, ''stations'')) WITH CHECK (public.is_module_enabled(tenant_id, country_id, ''stations''))', t);
    EXECUTE format('CREATE POLICY "Scoped read" ON public.%I FOR SELECT TO authenticated USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id))', t);
    EXECUTE format('CREATE TRIGGER no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.logistics_no_delete()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hse_checklists','hse_checklist_items','hse_inspections','hse_inspection_answers','hse_events','hse_safety_items','hse_nonconformities','hse_attachments'] LOOP
    EXECUTE format('CREATE POLICY "License write insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "Writers insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_module(auth.uid(), ''stations''))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hse_checklists','hse_checklist_items','hse_inspections','hse_inspection_answers','hse_events','hse_safety_items','hse_nonconformities'] LOOP
    EXECUTE format('CREATE POLICY "License write update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.tenant_write_allowed(tenant_id))', t);
    EXECUTE format('CREATE POLICY "Writers update" ON public.%I FOR UPDATE TO authenticated USING (public.can_write_module(auth.uid(), ''stations''))', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
  END LOOP;
END $$;

CREATE TRIGGER history_immutable BEFORE UPDATE ON public.hse_history FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();
CREATE TRIGGER attachments_immutable BEFORE UPDATE ON public.hse_attachments FOR EACH ROW EXECUTE FUNCTION public.logistics_immutable();

-- Status changes of inspections and non-conformities only via hse_action
CREATE OR REPLACE FUNCTION public.hse_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('hse.rpc', true), '') = '1' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'hse_inspections' THEN
    IF TG_OP = 'INSERT' THEN NEW.status := 'draft'; NEW.score := NULL; NEW.validated_by := NULL; NEW.validated_at := NULL; NEW.submitted_by := NULL; NEW.submitted_at := NULL;
    ELSIF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Inspection verrouillée (statut %)', OLD.status;
    ELSIF NEW.status <> OLD.status OR NEW.score IS DISTINCT FROM OLD.score OR NEW.validated_by IS DISTINCT FROM OLD.validated_by THEN RAISE EXCEPTION 'Changement de statut uniquement via le workflow';
    END IF;
  ELSIF TG_TABLE_NAME = 'hse_nonconformities' THEN
    IF TG_OP = 'INSERT' THEN NEW.status := 'open'; NEW.closed_by := NULL; NEW.closed_at := NULL; NEW.closure_proof := NULL; NEW.closure_attachment := NULL;
    ELSIF OLD.status = 'closed' THEN RAISE EXCEPTION 'Non-conformité close : réouverture via le workflow';
    ELSIF NEW.status <> OLD.status OR NEW.closed_by IS DISTINCT FROM OLD.closed_by OR NEW.closure_proof IS DISTINCT FROM OLD.closure_proof OR NEW.severity <> OLD.severity THEN RAISE EXCEPTION 'Changement de statut uniquement via le workflow';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON public.hse_inspections FOR EACH ROW EXECUTE FUNCTION public.hse_guard();
CREATE TRIGGER guard BEFORE INSERT OR UPDATE ON public.hse_nonconformities FOR EACH ROW EXECUTE FUNCTION public.hse_guard();

CREATE OR REPLACE FUNCTION public.hse_answer_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM hse_inspections WHERE id = NEW.inspection_id;
  IF st IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Inspection verrouillée : réponses non modifiables'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answer_guard BEFORE INSERT OR UPDATE ON public.hse_inspection_answers FOR EACH ROW EXECUTE FUNCTION public.hse_answer_guard();

CREATE OR REPLACE FUNCTION public.hse_action(_entity text, _id uuid, _action text, _comment text DEFAULT NULL, _data jsonb DEFAULT '{}'::jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i hse_inspections; n hse_nonconformities; s numeric; newst text; uid uuid := auth.uid();
BEGIN
  IF NOT public.can_write_module(uid, 'stations') THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  PERFORM set_config('hse.rpc', '1', true);
  IF _entity = 'inspection' THEN
    SELECT * INTO i FROM hse_inspections WHERE id = _id FOR UPDATE;
    IF i.id IS NULL OR NOT public.can_access_tenant_country(uid, i.tenant_id, i.country_id) THEN RAISE EXCEPTION 'Inspection introuvable'; END IF;
    IF NOT public.tenant_write_allowed(i.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
    IF _action = 'submit' AND i.status IN ('draft','rejected') THEN
      IF EXISTS (SELECT 1 FROM hse_checklist_items ci WHERE ci.checklist_id = i.checklist_id AND ci.is_active
                 AND NOT EXISTS (SELECT 1 FROM hse_inspection_answers a WHERE a.inspection_id = i.id AND a.item_id = ci.id)) THEN
        RAISE EXCEPTION 'Tous les points de contrôle doivent être renseignés';
      END IF;
      SELECT round(100 * coalesce(sum(ci.weight) FILTER (WHERE a.result = 'ok'), 0) / nullif(sum(ci.weight) FILTER (WHERE a.result <> 'na'), 0), 1)
        INTO s FROM hse_inspection_answers a JOIN hse_checklist_items ci ON ci.id = a.item_id WHERE a.inspection_id = i.id;
      UPDATE hse_inspections SET status = 'submitted', score = coalesce(s, 100), submitted_by = uid, submitted_at = now() WHERE id = i.id;
      newst := 'submitted';
    ELSIF _action = 'validate' AND i.status = 'submitted' THEN
      UPDATE hse_inspections SET status = 'validated', validated_by = uid, validated_at = now() WHERE id = i.id;
      INSERT INTO hse_nonconformities (tenant_id, country_id, station_id, inspection_id, item_id, title, description, severity, due_on, created_by)
      SELECT i.tenant_id, i.country_id, i.station_id, i.id, ci.id, ci.label, a.comment,
             CASE WHEN ci.is_critical THEN 'critical' ELSE 'major' END,
             i.inspected_on + CASE WHEN ci.is_critical THEN 7 ELSE 30 END, uid
      FROM hse_inspection_answers a JOIN hse_checklist_items ci ON ci.id = a.item_id
      WHERE a.inspection_id = i.id AND a.result = 'nok';
      newst := 'validated';
    ELSIF _action = 'reject' AND i.status = 'submitted' THEN
      IF coalesce(trim(_comment), '') = '' THEN RAISE EXCEPTION 'Motif de rejet obligatoire'; END IF;
      UPDATE hse_inspections SET status = 'draft', score = NULL WHERE id = i.id;
      newst := 'draft';
    ELSE RAISE EXCEPTION 'Action % impossible au statut %', _action, i.status; END IF;
    INSERT INTO hse_history (tenant_id, country_id, entity_type, entity_id, action, comment, details)
      VALUES (i.tenant_id, i.country_id, 'inspection', i.id, _action, _comment, jsonb_build_object('from', i.status, 'to', newst, 'score', s));
    PERFORM public.log_audit_event('hse_inspection_' || _action, 'hse', 'hse_inspection', i.id::text, i.country_id, jsonb_build_object('to', newst, 'comment', _comment), NULL);
  ELSIF _entity = 'nonconformity' THEN
    SELECT * INTO n FROM hse_nonconformities WHERE id = _id FOR UPDATE;
    IF n.id IS NULL OR NOT public.can_access_tenant_country(uid, n.tenant_id, n.country_id) THEN RAISE EXCEPTION 'Non-conformité introuvable'; END IF;
    IF NOT public.tenant_write_allowed(n.tenant_id) THEN RAISE EXCEPTION 'Licence en lecture seule'; END IF;
    IF _action = 'start' AND n.status = 'open' THEN newst := 'in_progress';
      UPDATE hse_nonconformities SET status = newst WHERE id = n.id;
    ELSIF _action = 'submit_closure' AND n.status IN ('open','in_progress') THEN
      IF coalesce(trim(_data->>'proof'), '') = '' THEN RAISE EXCEPTION 'Preuve de clôture obligatoire'; END IF;
      newst := 'pending_validation';
      UPDATE hse_nonconformities SET status = newst, closure_proof = _data->>'proof', closure_attachment = nullif(_data->>'attachment', ''),
        closure_submitted_by = uid, closure_submitted_at = now() WHERE id = n.id;
    ELSIF _action = 'validate_closure' AND n.status = 'pending_validation' THEN
      IF n.severity = 'critical' AND n.closure_submitted_by = uid THEN RAISE EXCEPTION 'Une non-conformité critique doit être validée par une autre personne'; END IF;
      newst := 'closed';
      UPDATE hse_nonconformities SET status = newst, closed_by = uid, closed_at = now() WHERE id = n.id;
    ELSIF _action = 'reject_closure' AND n.status = 'pending_validation' THEN
      IF coalesce(trim(_comment), '') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
      newst := 'in_progress';
      UPDATE hse_nonconformities SET status = newst WHERE id = n.id;
    ELSIF _action = 'reopen' AND n.status = 'closed' THEN
      IF coalesce(trim(_comment), '') = '' THEN RAISE EXCEPTION 'Motif de réouverture obligatoire'; END IF;
      newst := 'in_progress';
      UPDATE hse_nonconformities SET status = newst, closed_by = NULL, closed_at = NULL WHERE id = n.id;
    ELSE RAISE EXCEPTION 'Action % impossible au statut %', _action, n.status; END IF;
    INSERT INTO hse_history (tenant_id, country_id, entity_type, entity_id, action, comment, details)
      VALUES (n.tenant_id, n.country_id, 'nonconformity', n.id, _action, _comment, jsonb_build_object('from', n.status, 'to', newst, 'proof', _data->>'proof'));
    PERFORM public.log_audit_event('hse_nc_' || _action, 'hse', 'hse_nonconformity', n.id::text, n.country_id, jsonb_build_object('to', newst, 'comment', _comment), NULL);
  ELSE RAISE EXCEPTION 'Entité inconnue'; END IF;
  RETURN newst;
END $$;
REVOKE ALL ON FUNCTION public.hse_action(text, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hse_action(text, uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.hse_nc_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO hse_history (tenant_id, country_id, entity_type, entity_id, action, details)
  VALUES (NEW.tenant_id, NEW.country_id, TG_ARGV[0], NEW.id, 'create', to_jsonb(NEW) - 'tenant_id' - 'country_id');
  RETURN NEW;
END $$;
CREATE TRIGGER history_create AFTER INSERT ON public.hse_nonconformities FOR EACH ROW EXECUTE FUNCTION public.hse_nc_created('nonconformity');
CREATE TRIGGER history_create AFTER INSERT ON public.hse_events FOR EACH ROW EXECUTE FUNCTION public.hse_nc_created('event');
CREATE TRIGGER history_create AFTER INSERT ON public.hse_inspections FOR EACH ROW EXECUTE FUNCTION public.hse_nc_created('inspection');

CREATE INDEX hse_nc_scope_idx ON public.hse_nonconformities (tenant_id, country_id, status, severity);
CREATE INDEX hse_insp_scope_idx ON public.hse_inspections (tenant_id, country_id, station_id, inspected_on);
CREATE INDEX hse_history_entity_idx ON public.hse_history (entity_id, created_at);