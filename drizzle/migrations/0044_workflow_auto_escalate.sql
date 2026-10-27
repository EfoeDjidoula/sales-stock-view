
CREATE OR REPLACE FUNCTION public.workflow_auto_escalate() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_role text; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.workflow_requests WHERE status='submitted' AND step_due_at IS NOT NULL AND step_due_at < now() FOR UPDATE SKIP LOCKED LOOP
    v_role := r.steps->(r.current_step-1)->>'escalation_role_code';
    IF v_role IS NULL THEN CONTINUE; END IF;
    UPDATE public.workflow_requests SET status='escalated', current_role_code=v_role, step_due_at=now()+interval '24 hours', updated_at=now() WHERE id=r.id;
    INSERT INTO public.workflow_events(request_id,tenant_id,country_id,action,from_status,to_status,step_order,actor_id,comment)
    VALUES (r.id,r.tenant_id,r.country_id,'escalate','submitted','escalated',r.current_step,'00000000-0000-0000-0000-000000000000',
      'Escalade automatique : délai de l''étape dépassé');
    n := n+1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.workflow_auto_escalate() FROM public, anon, authenticated;
SELECT cron.schedule('workflow-auto-escalate','5 * * * *','SELECT public.workflow_auto_escalate()');
