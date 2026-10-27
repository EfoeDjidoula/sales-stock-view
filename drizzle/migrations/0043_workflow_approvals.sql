
INSERT INTO public.permissions(code, module, action, label) VALUES
 ('workflows.view','workflows','view','Voir les circuits et demandes d''approbation'),
 ('workflows.manage','workflows','administer','Configurer les circuits d''approbation')
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.is_system AND p.code='workflows.view'
   OR (r.is_system AND r.code IN ('client_admin','country_director') AND p.code='workflows.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  name text NOT NULL,
  module text NOT NULL,
  operation_type text NOT NULL,
  min_amount numeric, max_amount numeric,
  min_volume numeric, max_volume numeric,
  requester_role_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_definitions TO authenticated;
GRANT ALL ON public.workflow_definitions TO service_role;
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_def_read ON public.workflow_definitions FOR SELECT TO authenticated
 USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id));

CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  step_order integer NOT NULL CHECK (step_order > 0),
  label text NOT NULL,
  role_code text NOT NULL,
  sla_hours integer CHECK (sla_hours IS NULL OR sla_hours > 0),
  escalation_role_code text,
  UNIQUE(definition_id, step_order)
);
GRANT SELECT ON public.workflow_steps TO authenticated;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_steps_read ON public.workflow_steps FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.workflow_definitions d WHERE d.id=definition_id
   AND public.can_access_tenant_country(auth.uid(), d.tenant_id, d.country_id)));

CREATE TABLE public.workflow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('WF-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid NOT NULL REFERENCES public.countries(id),
  definition_id uuid REFERENCES public.workflow_definitions(id),
  module text NOT NULL,
  operation_type text NOT NULL,
  title text NOT NULL,
  description text,
  amount numeric CHECK (amount IS NULL OR amount >= 0),
  volume numeric CHECK (volume IS NULL OR volume >= 0),
  entity_type text, entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','cancelled','escalated')),
  current_step integer NOT NULL DEFAULT 0,
  current_role_code text,
  step_due_at timestamptz,
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  submitted_at timestamptz, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_requests TO authenticated;
GRANT ALL ON public.workflow_requests TO service_role;
ALTER TABLE public.workflow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_req_read ON public.workflow_requests FOR SELECT TO authenticated
 USING (public.can_access_tenant_country(auth.uid(), tenant_id, country_id)
   AND (requested_by = auth.uid() OR public.has_permission(auth.uid(),'workflows.view') OR public.is_platform_admin(auth.uid())));

CREATE TABLE public.workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.workflow_requests(id),
  tenant_id uuid NOT NULL, country_id uuid NOT NULL,
  action text NOT NULL,
  from_status text, to_status text,
  step_order integer,
  actor_id uuid NOT NULL,
  on_behalf_of uuid,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workflow_events TO authenticated;
GRANT ALL ON public.workflow_events TO service_role;
ALTER TABLE public.workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_ev_read ON public.workflow_events FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.workflow_requests r WHERE r.id=request_id));

CREATE TABLE public.workflow_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  country_id uuid REFERENCES public.countries(id),
  delegator_id uuid NOT NULL,
  delegate_id uuid NOT NULL,
  module text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at), CHECK (delegator_id <> delegate_id)
);
GRANT SELECT ON public.workflow_delegations TO authenticated;
GRANT ALL ON public.workflow_delegations TO service_role;
ALTER TABLE public.workflow_delegations ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_del_read ON public.workflow_delegations FOR SELECT TO authenticated
 USING (public.can_access_tenant(auth.uid(), tenant_id)
   AND (delegator_id = auth.uid() OR delegate_id = auth.uid() OR public.has_permission(auth.uid(),'workflows.manage') OR public.is_platform_admin(auth.uid())));

CREATE OR REPLACE FUNCTION public.workflow_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historique d''approbation immuable'; END $$;
CREATE TRIGGER workflow_events_no_change BEFORE UPDATE OR DELETE ON public.workflow_events
 FOR EACH ROW EXECUTE FUNCTION public.workflow_events_immutable();
CREATE TRIGGER workflow_requests_no_delete BEFORE DELETE ON public.workflow_requests
 FOR EACH ROW EXECUTE FUNCTION public.workflow_events_immutable();

-- Correspondance module de permission -> module licencié
CREATE OR REPLACE FUNCTION public.workflow_license_module(_module text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE _module WHEN 'stock' THEN 'stocks' WHEN 'sales' THEN 'ventes' WHEN 'clients' THEN 'clients_b2b'
  WHEN 'fuel_cards' THEN 'cartes_carburant' WHEN 'orders' THEN 'commandes' WHEN 'supplies' THEN 'livraisons'
  WHEN 'price_structures' THEN 'facturation' WHEN 'suppliers' THEN 'achats' WHEN 'stations' THEN 'stations'
  WHEN 'fraud' THEN 'anti_fraude' WHEN 'reconciliation' THEN 'ventes' ELSE NULL END $$;

CREATE OR REPLACE FUNCTION public.workflow_user_has_role(_user uuid, _tenant uuid, _country uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.can_access_tenant_country(_user,_tenant,_country)
  AND EXISTS (SELECT 1 FROM public.user_role_assignments a JOIN public.roles r ON r.id=a.role_id
     WHERE a.user_id=_user AND a.tenant_id=_tenant AND r.code=_role)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_user AND p.is_active) $$;

-- L'utilisateur peut-il décider à l'étape courante (lui-même ou par délégation active) ? renvoie le délégant ou lui-même, NULL sinon
CREATE OR REPLACE FUNCTION public.workflow_acting_for(_req public.workflow_requests, _user uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d record;
BEGIN
  IF _req.current_role_code IS NULL THEN RETURN NULL; END IF;
  IF public.workflow_user_has_role(_user,_req.tenant_id,_req.country_id,_req.current_role_code) THEN RETURN _user; END IF;
  IF NOT public.can_access_tenant_country(_user,_req.tenant_id,_req.country_id) THEN RETURN NULL; END IF;
  FOR d IN SELECT * FROM public.workflow_delegations w WHERE w.delegate_id=_user AND w.tenant_id=_req.tenant_id
     AND w.revoked_at IS NULL AND now() BETWEEN w.starts_at AND w.ends_at
     AND (w.country_id IS NULL OR w.country_id=_req.country_id) AND (w.module IS NULL OR w.module=_req.module) LOOP
    IF public.workflow_user_has_role(d.delegator_id,_req.tenant_id,_req.country_id,_req.current_role_code) THEN RETURN d.delegator_id; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_can_decide(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.workflow_requests r WHERE r.id=_id AND r.status IN ('submitted','escalated')
   AND r.requested_by <> auth.uid() AND public.workflow_acting_for(r, auth.uid()) IS NOT NULL) $$;

CREATE OR REPLACE FUNCTION public.workflow_guard_scope(_tenant uuid, _country uuid, _module text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE lm text := public.workflow_license_module(_module);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF NOT public.can_access_tenant_country(auth.uid(),_tenant,_country) THEN RAISE EXCEPTION 'Périmètre société/pays non autorisé'; END IF;
  IF NOT public.tenant_write_allowed(_tenant) THEN RAISE EXCEPTION 'Licence en lecture seule : action impossible'; END IF;
  IF lm IS NOT NULL AND _country IS NOT NULL AND NOT public.is_module_enabled(_tenant,_country,lm) THEN RAISE EXCEPTION 'Module % non activé pour ce pays', lm; END IF;
END $$;

-- Configuration des circuits
CREATE OR REPLACE FUNCTION public.workflow_save_definition(_id uuid, _data jsonb, _steps jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid := _id; v_tenant uuid := (_data->>'tenant_id')::uuid; v_country uuid := nullif(_data->>'country_id','')::uuid; s jsonb; i int := 0;
BEGIN
  IF v_id IS NOT NULL THEN SELECT tenant_id INTO v_tenant FROM public.workflow_definitions WHERE id=v_id; END IF;
  IF NOT (public.is_platform_admin(auth.uid()) OR (public.has_permission(auth.uid(),'workflows.manage') AND public.can_access_tenant(auth.uid(),v_tenant))) THEN
    RAISE EXCEPTION 'Permission workflows.manage requise'; END IF;
  PERFORM public.workflow_guard_scope(v_tenant, v_country, NULL);
  IF coalesce(trim(_data->>'name'),'')='' OR coalesce(_data->>'module','')='' OR coalesce(_data->>'operation_type','')='' THEN RAISE EXCEPTION 'Nom, module et opération obligatoires'; END IF;
  IF jsonb_array_length(coalesce(_steps,'[]'))=0 THEN RAISE EXCEPTION 'Au moins une étape est requise'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.workflow_definitions(tenant_id,country_id,name,module,operation_type,min_amount,max_amount,min_volume,max_volume,requester_role_code,is_active)
    VALUES (v_tenant,v_country,_data->>'name',_data->>'module',_data->>'operation_type',nullif(_data->>'min_amount','')::numeric,nullif(_data->>'max_amount','')::numeric,
      nullif(_data->>'min_volume','')::numeric,nullif(_data->>'max_volume','')::numeric,nullif(_data->>'requester_role_code',''),coalesce((_data->>'is_active')::boolean,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.workflow_definitions SET country_id=v_country,name=_data->>'name',module=_data->>'module',operation_type=_data->>'operation_type',
      min_amount=nullif(_data->>'min_amount','')::numeric,max_amount=nullif(_data->>'max_amount','')::numeric,min_volume=nullif(_data->>'min_volume','')::numeric,
      max_volume=nullif(_data->>'max_volume','')::numeric,requester_role_code=nullif(_data->>'requester_role_code',''),is_active=coalesce((_data->>'is_active')::boolean,true),updated_at=now()
    WHERE id=v_id;
    DELETE FROM public.workflow_steps WHERE definition_id=v_id;
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(_steps) LOOP
    i := i+1;
    IF NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.code=s->>'role_code' AND (r.tenant_id IS NULL OR r.tenant_id=v_tenant)) THEN RAISE EXCEPTION 'Rôle inconnu : %', s->>'role_code'; END IF;
    INSERT INTO public.workflow_steps(definition_id,tenant_id,step_order,label,role_code,sla_hours,escalation_role_code)
    VALUES (v_id,v_tenant,i,coalesce(nullif(s->>'label',''),s->>'role_code'),s->>'role_code',nullif(s->>'sla_hours','')::int,nullif(s->>'escalation_role_code',''));
  END LOOP;
  PERFORM public.audit_business_event('workflow_definition_saved','workflows','workflow_definition',v_id::text,v_country,jsonb_build_object('data',_data,'steps',_steps),NULL);
  RETURN v_id;
END $$;

-- Délégations
CREATE OR REPLACE FUNCTION public.workflow_delegate(_tenant uuid, _country uuid, _delegate uuid, _module text, _starts timestamptz, _ends timestamptz, _reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid;
BEGIN
  PERFORM public.workflow_guard_scope(_tenant,_country,NULL);
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  IF _ends <= _starts OR _ends < now() THEN RAISE EXCEPTION 'Période de délégation invalide'; END IF;
  IF _ends - _starts > interval '90 days' THEN RAISE EXCEPTION 'Délégation limitée à 90 jours'; END IF;
  IF NOT public.can_access_tenant_country(_delegate,_tenant,_country) OR public.is_platform_admin(_delegate) AND NOT public.can_access_tenant(_delegate,_tenant) THEN
    RAISE EXCEPTION 'Le délégataire n''a pas accès à ce périmètre'; END IF;
  INSERT INTO public.workflow_delegations(tenant_id,country_id,delegator_id,delegate_id,module,starts_at,ends_at,reason)
  VALUES (_tenant,_country,auth.uid(),_delegate,nullif(_module,''),_starts,_ends,_reason) RETURNING id INTO v;
  PERFORM public.audit_business_event('workflow_delegation_created','workflows','workflow_delegation',v::text,_country,
    jsonb_build_object('delegate',_delegate,'module',_module,'starts',_starts,'ends',_ends,'reason',_reason),NULL);
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_revoke_delegation(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record;
BEGIN
  SELECT * INTO d FROM public.workflow_delegations WHERE id=_id;
  IF NOT FOUND OR d.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Délégation introuvable ou déjà révoquée'; END IF;
  IF d.delegator_id <> auth.uid() AND NOT (public.has_permission(auth.uid(),'workflows.manage') AND public.can_access_tenant(auth.uid(),d.tenant_id)) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Révocation non autorisée'; END IF;
  UPDATE public.workflow_delegations SET revoked_at=now() WHERE id=_id;
  PERFORM public.audit_business_event('workflow_delegation_revoked','workflows','workflow_delegation',_id::text,d.country_id,'{}'::jsonb,NULL);
END $$;

-- Création d'une demande (brouillon)
CREATE OR REPLACE FUNCTION public.workflow_create_request(_tenant uuid, _country uuid, _module text, _operation text, _title text, _data jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid;
BEGIN
  PERFORM public.workflow_guard_scope(_tenant,_country,_module);
  IF _country IS NULL THEN RAISE EXCEPTION 'Pays obligatoire'; END IF;
  IF NOT (public.has_permission(auth.uid(),_module||'.view') OR public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Permission %.view requise', _module; END IF;
  IF coalesce(trim(_title),'')='' THEN RAISE EXCEPTION 'Objet obligatoire'; END IF;
  INSERT INTO public.workflow_requests(tenant_id,country_id,module,operation_type,title,description,amount,volume,entity_type,entity_id,payload)
  VALUES (_tenant,_country,_module,_operation,_title,_data->>'description',nullif(_data->>'amount','')::numeric,nullif(_data->>'volume','')::numeric,
    nullif(_data->>'entity_type',''),nullif(_data->>'entity_id',''),coalesce(_data->'payload','{}'::jsonb))
  RETURNING id INTO v;
  INSERT INTO public.workflow_events(request_id,tenant_id,country_id,action,to_status,actor_id) VALUES (v,_tenant,_country,'create','draft',auth.uid());
  PERFORM public.audit_business_event('workflow_request_created','workflows','workflow_request',v::text,_country,_data,NULL);
  RETURN v;
END $$;

-- Transitions : submit, approve, reject, cancel, escalate, comment
CREATE OR REPLACE FUNCTION public.workflow_action(_id uuid, _action text, _comment text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.workflow_requests; d record; v_steps jsonb; v_role text; v_next jsonb; v_from text; v_to text; v_for uuid; v_step int; n int;
BEGIN
  SELECT * INTO r FROM public.workflow_requests WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  PERFORM public.workflow_guard_scope(r.tenant_id,r.country_id,r.module);
  v_from := r.status; v_to := r.status; v_step := r.current_step;

  IF _action = 'comment' THEN
    IF coalesce(trim(_comment),'')='' THEN RAISE EXCEPTION 'Commentaire vide'; END IF;
    IF r.requested_by<>auth.uid() AND public.workflow_acting_for(r,auth.uid()) IS NULL AND NOT public.has_permission(auth.uid(),'workflows.view') THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  ELSIF _action = 'submit' THEN
    IF r.status<>'draft' THEN RAISE EXCEPTION 'Seul un brouillon peut être soumis'; END IF;
    IF r.requested_by<>auth.uid() THEN RAISE EXCEPTION 'Seul le demandeur peut soumettre'; END IF;
    SELECT * INTO d FROM public.workflow_definitions w
     WHERE w.tenant_id=r.tenant_id AND w.is_active AND w.module=r.module AND w.operation_type=r.operation_type
       AND (w.country_id IS NULL OR w.country_id=r.country_id)
       AND (w.min_amount IS NULL OR coalesce(r.amount,0)>=w.min_amount) AND (w.max_amount IS NULL OR coalesce(r.amount,0)<=w.max_amount)
       AND (w.min_volume IS NULL OR coalesce(r.volume,0)>=w.min_volume) AND (w.max_volume IS NULL OR coalesce(r.volume,0)<=w.max_volume)
       AND (w.requester_role_code IS NULL OR public.workflow_user_has_role(auth.uid(),r.tenant_id,r.country_id,w.requester_role_code))
     ORDER BY (w.country_id IS NOT NULL) DESC, (w.requester_role_code IS NOT NULL) DESC, coalesce(w.min_amount,0) DESC, coalesce(w.min_volume,0) DESC
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aucun circuit d''approbation actif ne correspond à cette opération'; END IF;
    SELECT jsonb_agg(jsonb_build_object('order',s.step_order,'label',s.label,'role_code',s.role_code,'sla_hours',s.sla_hours,'escalation_role_code',s.escalation_role_code) ORDER BY s.step_order)
      INTO v_steps FROM public.workflow_steps s WHERE s.definition_id=d.id;
    v_next := v_steps->0;
    UPDATE public.workflow_requests SET status='submitted',definition_id=d.id,steps=v_steps,current_step=1,current_role_code=v_next->>'role_code',
      step_due_at=CASE WHEN v_next->>'sla_hours' IS NOT NULL THEN now()+((v_next->>'sla_hours')||' hours')::interval END,submitted_at=now(),updated_at=now() WHERE id=_id;
    v_to := 'submitted'; v_step := 1;

  ELSIF _action IN ('approve','reject','escalate') THEN
    IF r.status NOT IN ('submitted','escalated') THEN RAISE EXCEPTION 'Demande non en attente de décision'; END IF;
    IF r.requested_by=auth.uid() THEN RAISE EXCEPTION 'Un demandeur ne peut pas valider sa propre demande'; END IF;
    v_for := public.workflow_acting_for(r,auth.uid());
    IF v_for IS NULL THEN RAISE EXCEPTION 'Vous n''êtes pas approbateur (rôle %) de cette étape', r.current_role_code; END IF;
    IF EXISTS (SELECT 1 FROM public.workflow_events e WHERE e.request_id=_id AND e.action='approve' AND coalesce(e.on_behalf_of,e.actor_id) IN (auth.uid(),v_for)) THEN
      RAISE EXCEPTION 'Vous avez déjà approuvé une étape de cette demande'; END IF;
    IF _action='reject' THEN
      IF coalesce(trim(_comment),'')='' THEN RAISE EXCEPTION 'Motif de rejet obligatoire'; END IF;
      UPDATE public.workflow_requests SET status='rejected',decided_at=now(),current_role_code=NULL,step_due_at=NULL,updated_at=now() WHERE id=_id;
      v_to := 'rejected';
    ELSIF _action='escalate' THEN
      IF coalesce(trim(_comment),'')='' THEN RAISE EXCEPTION 'Motif d''escalade obligatoire'; END IF;
      v_role := r.steps->(r.current_step-1)->>'escalation_role_code';
      IF v_role IS NULL OR r.status='escalated' THEN RAISE EXCEPTION 'Aucune escalade prévue pour cette étape'; END IF;
      UPDATE public.workflow_requests SET status='escalated',current_role_code=v_role,step_due_at=now()+interval '24 hours',updated_at=now() WHERE id=_id;
      v_to := 'escalated';
    ELSE
      n := jsonb_array_length(r.steps);
      IF r.current_step >= n THEN
        UPDATE public.workflow_requests SET status='approved',decided_at=now(),current_role_code=NULL,step_due_at=NULL,updated_at=now() WHERE id=_id;
        v_to := 'approved';
      ELSE
        v_next := r.steps->r.current_step;
        UPDATE public.workflow_requests SET status='submitted',current_step=r.current_step+1,current_role_code=v_next->>'role_code',
          step_due_at=CASE WHEN v_next->>'sla_hours' IS NOT NULL THEN now()+((v_next->>'sla_hours')||' hours')::interval END,updated_at=now() WHERE id=_id;
        v_to := 'submitted';
      END IF;
    END IF;

  ELSIF _action = 'cancel' THEN
    IF r.status NOT IN ('draft','submitted','escalated') THEN RAISE EXCEPTION 'Demande déjà clôturée'; END IF;
    IF r.requested_by<>auth.uid() AND NOT (public.has_permission(auth.uid(),'workflows.manage')) THEN RAISE EXCEPTION 'Seul le demandeur peut annuler'; END IF;
    UPDATE public.workflow_requests SET status='cancelled',decided_at=now(),current_role_code=NULL,step_due_at=NULL,updated_at=now() WHERE id=_id;
    v_to := 'cancelled';
  ELSE
    RAISE EXCEPTION 'Action inconnue : %', _action;
  END IF;

  INSERT INTO public.workflow_events(request_id,tenant_id,country_id,action,from_status,to_status,step_order,actor_id,on_behalf_of,comment)
  VALUES (_id,r.tenant_id,r.country_id,_action,v_from,v_to,v_step,auth.uid(),CASE WHEN v_for IS DISTINCT FROM auth.uid() THEN v_for END,nullif(trim(_comment),''));
  PERFORM public.audit_business_event('workflow_'||_action,'workflows','workflow_request',_id::text,r.country_id,
    jsonb_build_object('from',v_from,'to',v_to,'step',v_step,'on_behalf_of',v_for,'comment',_comment),NULL);
  RETURN v_to;
END $$;

REVOKE ALL ON FUNCTION public.workflow_action(uuid,text,text), public.workflow_create_request(uuid,uuid,text,text,text,jsonb),
  public.workflow_delegate(uuid,uuid,uuid,text,timestamptz,timestamptz,text), public.workflow_revoke_delegation(uuid),
  public.workflow_save_definition(uuid,jsonb,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.workflow_action(uuid,text,text), public.workflow_create_request(uuid,uuid,text,text,text,jsonb),
  public.workflow_delegate(uuid,uuid,uuid,text,timestamptz,timestamptz,text), public.workflow_revoke_delegation(uuid),
  public.workflow_save_definition(uuid,jsonb,jsonb), public.workflow_can_decide(uuid) TO authenticated;
