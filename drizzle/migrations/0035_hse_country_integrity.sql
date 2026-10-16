CREATE OR REPLACE FUNCTION public.hse_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := to_jsonb(NEW); bad boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id <> OLD.tenant_id OR NEW.country_id <> OLD.country_id) THEN
    RAISE EXCEPTION 'Changement de société/pays interdit';
  END IF;
  IF j ? 'station_id' AND j->>'station_id' IS NOT NULL THEN
    bad := bad OR NOT EXISTS (SELECT 1 FROM stations s WHERE s.id = (j->>'station_id')::uuid AND s.tenant_id = NEW.tenant_id AND s.country_id = NEW.country_id);
  END IF;
  IF j ? 'checklist_id' AND j->>'checklist_id' IS NOT NULL THEN
    bad := bad OR NOT EXISTS (SELECT 1 FROM hse_checklists c WHERE c.id = (j->>'checklist_id')::uuid AND c.tenant_id = NEW.tenant_id AND c.country_id = NEW.country_id);
  END IF;
  IF j ? 'inspection_id' AND j->>'inspection_id' IS NOT NULL THEN
    bad := bad OR NOT EXISTS (SELECT 1 FROM hse_inspections c WHERE c.id = (j->>'inspection_id')::uuid AND c.tenant_id = NEW.tenant_id AND c.country_id = NEW.country_id);
  END IF;
  IF j ? 'item_id' AND j->>'item_id' IS NOT NULL THEN
    bad := bad OR NOT EXISTS (SELECT 1 FROM hse_checklist_items c WHERE c.id = (j->>'item_id')::uuid AND c.tenant_id = NEW.tenant_id AND c.country_id = NEW.country_id);
  END IF;
  IF j ? 'event_id' AND j->>'event_id' IS NOT NULL THEN
    bad := bad OR NOT EXISTS (SELECT 1 FROM hse_events c WHERE c.id = (j->>'event_id')::uuid AND c.tenant_id = NEW.tenant_id AND c.country_id = NEW.country_id);
  END IF;
  IF bad THEN RAISE EXCEPTION 'Élément rattaché à une autre société ou un autre pays'; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['hse_checklists','hse_checklist_items','hse_inspections','hse_inspection_answers','hse_events','hse_safety_items','hse_nonconformities'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS scope_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER scope_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hse_scope_guard()', t);
  END LOOP;
END $$;