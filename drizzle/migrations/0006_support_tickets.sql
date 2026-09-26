CREATE POLICY "Support attachments admins" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'support-attachments' AND public.is_platform_admin(auth.uid()))
  WITH CHECK (bucket_id = 'support-attachments' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "Support attachments tenant read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND public.can_access_tenant(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Support attachments tenant upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND public.can_access_tenant(auth.uid(), ((storage.foldername(name))[1])::uuid));

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE DEFAULT ('TK-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_id uuid REFERENCES public.countries(id),
  station_id uuid REFERENCES public.stations(id) ON DELETE SET NULL,
  module_key text,
  category text NOT NULL CHECK (category IN ('incident','bug','assistance','configuration','evolution','other')),
  subject text NOT NULL CHECK (length(trim(subject)) > 0),
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','assigned','in_progress','waiting_client','resolved','closed')),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_by_name text,
  assigned_to uuid,
  assigned_to_name text,
  sla_hours integer NOT NULL DEFAULT 24,
  sla_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.support_tickets(tenant_id);
CREATE INDEX ON public.support_tickets(status);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tickets admins all" ON public.support_tickets FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Tickets tenant read" ON public.support_tickets FOR SELECT TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Tickets tenant create" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id) AND created_by = auth.uid());
CREATE POLICY "Tickets tenant update" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id)) WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id));

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created','comment','status','assign')),
  message text,
  from_status text,
  to_status text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_id uuid DEFAULT auth.uid(),
  author_name text,
  is_lumatek boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.support_ticket_events(ticket_id);
GRANT SELECT, INSERT ON public.support_ticket_events TO authenticated;
GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Events admins all" ON public.support_ticket_events FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Events tenant read" ON public.support_ticket_events FOR SELECT TO authenticated
  USING (public.can_access_tenant(auth.uid(), tenant_id));
CREATE POLICY "Events tenant comment" ON public.support_ticket_events FOR INSERT TO authenticated
  WITH CHECK (public.can_access_tenant(auth.uid(), tenant_id) AND event_type = 'comment' AND is_lumatek = false AND author_id = auth.uid());

-- File d'attente des notifications email (envoi futur)
CREATE TABLE public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event text NOT NULL,
  audience text NOT NULL CHECK (audience IN ('client','lumatek')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_notifications TO authenticated;
GRANT ALL ON public.support_notifications TO service_role;
ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications admins read" ON public.support_notifications FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.support_ticket_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_admin boolean := public.is_platform_admin(auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'new';
    NEW.sla_hours := CASE NEW.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 8 WHEN 'normal' THEN 24 ELSE 72 END;
    NEW.sla_due_at := now() + make_interval(hours => NEW.sla_hours);
    IF NOT is_admin THEN NEW.assigned_to := NULL; NEW.assigned_to_name := NULL; NEW.first_response_at := NULL; END IF;
    IF NEW.created_by_name IS NULL THEN
      SELECT full_name INTO NEW.created_by_name FROM public.profiles WHERE user_id = NEW.created_by;
    END IF;
    RETURN NEW;
  END IF;
  IF NOT is_admin THEN
    -- Le client ne peut que clôturer, relancer (en cours) ou corriger objet/description/pièces jointes
    NEW.tenant_id := OLD.tenant_id; NEW.created_by := OLD.created_by; NEW.priority := OLD.priority;
    NEW.assigned_to := OLD.assigned_to; NEW.assigned_to_name := OLD.assigned_to_name;
    NEW.sla_hours := OLD.sla_hours; NEW.sla_due_at := OLD.sla_due_at; NEW.first_response_at := OLD.first_response_at;
    IF NEW.status <> OLD.status AND NOT (NEW.status = 'closed' OR (NEW.status = 'in_progress' AND OLD.status IN ('waiting_client','resolved'))) THEN
      RAISE EXCEPTION 'Changement de statut non autorisé';
    END IF;
  ELSIF NEW.priority <> OLD.priority THEN
    NEW.sla_hours := CASE NEW.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 8 WHEN 'normal' THEN 24 ELSE 72 END;
    NEW.sla_due_at := NEW.created_at + make_interval(hours => NEW.sla_hours);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL AND NEW.status = 'new' THEN
    NEW.status := 'assigned';
  END IF;
  IF NEW.status <> OLD.status THEN
    IF is_admin AND NEW.first_response_at IS NULL AND NEW.status <> 'new' THEN NEW.first_response_at := now(); END IF;
    IF NEW.status = 'resolved' THEN NEW.resolved_at := now(); END IF;
    IF NEW.status = 'closed' THEN NEW.closed_at := now(); IF NEW.resolved_at IS NULL THEN NEW.resolved_at := now(); END IF; END IF;
    IF NEW.status NOT IN ('resolved','closed') THEN NEW.resolved_at := NULL; NEW.closed_at := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_support_ticket_before BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_before();

CREATE OR REPLACE FUNCTION public.support_ticket_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname text; adm boolean := public.is_platform_admin(auth.uid());
BEGIN
  SELECT full_name INTO uname FROM public.profiles WHERE user_id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.support_ticket_events(ticket_id, tenant_id, event_type, to_status, message, author_id, author_name, is_lumatek)
      VALUES (NEW.id, NEW.tenant_id, 'created', NEW.status, NEW.subject, auth.uid(), COALESCE(uname, NEW.created_by_name), adm);
    INSERT INTO public.support_notifications(ticket_id, tenant_id, event, audience, payload)
      VALUES (NEW.id, NEW.tenant_id, 'ticket_created', 'lumatek', jsonb_build_object('ticket_number', NEW.ticket_number, 'subject', NEW.subject, 'priority', NEW.priority));
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.support_ticket_events(ticket_id, tenant_id, event_type, message, author_id, author_name, is_lumatek)
      VALUES (NEW.id, NEW.tenant_id, 'assign', COALESCE(NEW.assigned_to_name, 'Non assigné'), auth.uid(), uname, adm);
  END IF;
  IF NEW.status <> OLD.status THEN
    INSERT INTO public.support_ticket_events(ticket_id, tenant_id, event_type, from_status, to_status, author_id, author_name, is_lumatek)
      VALUES (NEW.id, NEW.tenant_id, 'status', OLD.status, NEW.status, auth.uid(), uname, adm);
    INSERT INTO public.support_notifications(ticket_id, tenant_id, event, audience, payload)
      VALUES (NEW.id, NEW.tenant_id, 'status_changed', CASE WHEN adm THEN 'client' ELSE 'lumatek' END,
        jsonb_build_object('ticket_number', NEW.ticket_number, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_support_ticket_after AFTER INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_after();

CREATE OR REPLACE FUNCTION public.support_event_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type = 'comment' THEN
    IF NEW.is_lumatek THEN
      UPDATE public.support_tickets SET first_response_at = COALESCE(first_response_at, now()), updated_at = now() WHERE id = NEW.ticket_id;
    END IF;
    INSERT INTO public.support_notifications(ticket_id, tenant_id, event, audience, payload)
      VALUES (NEW.ticket_id, NEW.tenant_id, 'comment_added', CASE WHEN NEW.is_lumatek THEN 'client' ELSE 'lumatek' END,
        jsonb_build_object('author', NEW.author_name, 'message', left(COALESCE(NEW.message,''), 500)));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_support_event_after AFTER INSERT ON public.support_ticket_events
  FOR EACH ROW EXECUTE FUNCTION public.support_event_after();
CREATE TRIGGER trg_support_tickets_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();