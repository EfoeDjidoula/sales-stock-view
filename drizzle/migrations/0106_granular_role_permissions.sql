ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS group_label text NOT NULL DEFAULT 'Droits communs';
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS screen_label text;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS prerequisites text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.rbac_require_permission(_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),_code) THEN RAISE EXCEPTION 'Droit requis : %',_code USING ERRCODE='42501'; END IF; END $$;
REVOKE ALL ON FUNCTION public.rbac_require_permission(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.rbac_require_permission(text) TO authenticated,service_role;
DO $$ DECLARE s record; a text; parents text[]; BEGIN
FOR s IN SELECT * FROM (VALUES
('depot_purchases','Pro-formas dépôt et bons de commande','Stocks & Logistique','supplies','view,create_proforma,issue_order,set_payment_status,edit_order,delete_order'),
('lifting_orders','Bons d’enlèvement','Stocks & Logistique','supplies','view,create,sign_logistics,sign_director,cancel'),
('transport','Chargements et transports','Stocks & Logistique','supplies','view,create,start_loading,finish_loading,depart,arrive,start_unloading,deliver,incident,resume,position,set_loads,confirm_site,rectify,justify'),
('delivery_notes','Bons de livraison numériques','Stocks & Logistique','supplies','view,generate,assign,sign_shipper,sign_driver,sign_consignee'),
('ecmr','e-CMR','Conformité & Reporting','reports','view,sign_shipper,sign_driver,sign_consignee'),
('fleet','Flotte, citernes et compartiments','Stocks & Logistique','supplies','view,create,edit'),
('carriers','Transporteurs','Stocks & Logistique','supplies','view,create,edit'),
('drivers','Chauffeurs','Stocks & Logistique','supplies','view,create,edit'),
('vehicle_documents','Documents et échéances','Stocks & Logistique','supplies','view,create,edit'),
('seals','Scellés','Stocks & Logistique','supplies','view,create,edit'),
('loading_tracking','Suivi des chargements','Stocks & Logistique','supplies','view'),
('lifting_allocation','Répartition BE / BL','Stocks & Logistique','supplies','view'),
('station_provision','Mise à disposition stations','Stocks & Logistique','supplies','view'),
('logistics_map','Carte et GPS','Stocks & Logistique','supplies','view'),
('logistics_alerts','Alertes logistiques','Stocks & Logistique','supplies','view'),
('station_tracking','Suivi logistique par station','Stocks & Logistique','supplies','view'),
('three_stocks','Bilan des trois stocks','Stocks & Logistique','supplies','view'),
('logistics_dashboard','Fiches de stock et tableau de bord logistique','Stocks & Logistique','supplies','view'),
('maintenance','Maintenance : accès général','Conformité & Reporting','stations','view'),
('maintenance_assets','Maintenance : équipements','Conformité & Reporting','stations','view,create,edit'),
('maintenance_plans','Maintenance : plans préventifs','Conformité & Reporting','stations','view,create,edit'),
('maintenance_work_orders','Maintenance : interventions et pièces','Conformité & Reporting','stations','view,create,edit,complete,cancel'),
('maintenance_alerts','Maintenance : alertes','Conformité & Reporting','stations','view'),
('hse_inspections','HSE : inspections','Conformité & Reporting','stations','view,create,edit,submit,validate,reject'),
('hse_events','HSE : incidents et exercices','Conformité & Reporting','stations','view,create,edit'),
('hse_nonconformities','HSE : non-conformités et actions','Conformité & Reporting','stations','view,create,edit,start,submit_closure,validate_closure,reject_closure,reopen'),
('hse_safety','HSE : extincteurs et EPI','Conformité & Reporting','stations','view,create,edit'),
('hse_checklists','HSE : checklists','Conformité & Reporting','stations','view,create,edit'),
('hse_agents','HSE : agents','Conformité & Reporting','stations','view,create,edit'),
('hse_scores','HSE : scores de conformité','Conformité & Reporting','stations','view'),
('b2b','Clients B2B : contrats et facturation','Clients, B2B & Cartes','clients','view,terms,exception,consumption,invoice,payment'),
('bi','BI avancée et prévisions','Pilotage & Direction','reports','view'),
('assistant','Analyse IA','Pilotage & Direction','reports','view'),
('periodic_reports','Rapports périodiques','Conformité & Reporting','reports','view'),
('pro_suite','Suite Pro','Conformité & Reporting','reports','view'),
('manager_accounts','Compte des gérants','Audit, Contrôle & Finance','synthesis','view'),
('account_closings','Arrêté des comptes','Audit, Contrôle & Finance','synthesis','view,validate,cancel'),
('ecap_recaps','Récapitulatifs ECAP','Audit, Contrôle & Finance','synthesis','view'),
('inventory_sheets','Fiches d’inventaire','Audit, Contrôle & Finance','synthesis','view'),
('network_sales','Bilan des ventes réseau','Audit, Contrôle & Finance','synthesis','view')
) x(module,label,grp,parent,actions) LOOP FOREACH a IN ARRAY string_to_array(s.actions,',') LOOP
parents:=CASE WHEN a='view' THEN ARRAY[s.parent||'.view'] WHEN s.module='account_closings' THEN ARRAY['synthesis.validate'] WHEN s.module='hse_agents' THEN ARRAY['hse.manage'] WHEN s.module='lifting_orders' AND a IN ('sign_logistics','sign_director','cancel') THEN ARRAY['supplies.validate'] WHEN s.module='depot_purchases' AND a<>'create_proforma' THEN ARRAY['supplies.validate'] WHEN s.module='delivery_notes' AND a LIKE 'sign_%' THEN ARRAY['supplies.validate','depotages.create','supplies.view'] WHEN s.module='ecmr' AND a<>'view' THEN ARRAY['supplies.create','supplies.edit','supplies.validate','supplies.administer'] WHEN s.module='b2b' AND a IN ('terms','exception') THEN ARRAY['clients.edit'] WHEN s.module='b2b' AND a IN ('invoice','payment') THEN ARRAY['clients.validate'] WHEN s.module='b2b' THEN ARRAY['clients.create'] ELSE ARRAY[s.parent||'.create',s.parent||'.edit',s.parent||'.validate',s.parent||'.delete',s.parent||'.administer'] END;
INSERT INTO public.permissions(code,module,action,label,screen_label,group_label,prerequisites) VALUES(s.module||'.'||a,s.module,a,s.label||' — '||a,s.label,s.grp,parents) ON CONFLICT(code) DO NOTHING;
END LOOP; END LOOP;
INSERT INTO public.permissions(code,module,action,label,prerequisites) VALUES('hse.manage','hse','manage','Gérer les agents HSE',ARRAY['hse.administer']) ON CONFLICT(code) DO NOTHING;
FOR s IN SELECT * FROM (VALUES
('fuel_cards','account,vehicle,driver,card,status,replace,topup,allocate,return,limit,restrictions,purchase,invoice,invoice_payment'),
('sales','submit,reject,reopen'),('index_entries','reject'),
('workflows','manage,submit,approve,reject,escalate,cancel,comment'),
('integrations','create,update,set_status,set_schedule,set_mapping,delete_mapping,enqueue,retry'),
('supplies','submit,approve,reject,order,load,depart,deliver,receive,cancel'),
('reconciliation','comment,analyze,request_justification,justify,escalate,reopen'),
('fraud','comment,analyze,request_justification,confirm,false_positive,close,reopen')
) x(module,actions) LOOP FOREACH a IN ARRAY string_to_array(s.actions,',') LOOP
parents:=CASE WHEN s.module='fuel_cards' AND a IN ('account','purchase') THEN ARRAY['fuel_cards.create'] WHEN s.module='fuel_cards' AND a IN ('invoice','invoice_payment') THEN ARRAY['fuel_cards.validate'] WHEN s.module='fuel_cards' THEN ARRAY['fuel_cards.edit'] WHEN s.module='sales' AND a='submit' THEN ARRAY['sales.create','sales.edit'] WHEN s.module='sales' THEN ARRAY['sales.validate'] WHEN s.module='index_entries' THEN ARRAY['index_entries.validate'] WHEN s.module='integrations' THEN ARRAY['integrations.manage'] WHEN s.module='workflows' THEN ARRAY['workflows.administer','workflows.view'] WHEN s.module='supplies' AND a IN ('approve','reject','receive') THEN ARRAY['supplies.validate'] WHEN s.module='supplies' THEN ARRAY['supplies.create','supplies.edit','supplies.validate'] WHEN s.module='reconciliation' THEN ARRAY['reconciliation.edit','reconciliation.validate'] WHEN s.module='fraud' AND a IN ('confirm','false_positive','close','reopen') THEN ARRAY['fraud.validate'] ELSE ARRAY['fraud.edit','fraud.validate'] END;
INSERT INTO public.permissions(code,module,action,label,prerequisites) VALUES(s.module||'.'||a,s.module,a,a,parents) ON CONFLICT(code) DO NOTHING;
END LOOP; END LOOP;
-- Two passes handle the HSE agent prerequisite introduced in this catalogue.
FOR a IN SELECT unnest(ARRAY['1','2']) LOOP
INSERT INTO public.role_permissions(role_id,permission_id) SELECT DISTINCT rp.role_id,p.id FROM public.permissions p JOIN public.permissions parent ON parent.code=ANY(p.prerequisites) JOIN public.role_permissions rp ON rp.permission_id=parent.id ON CONFLICT DO NOTHING;
END LOOP;
END $$;

DO $$ DECLARE r record; BEGIN FOR r IN SELECT * FROM (VALUES
('logistics_carriers','carriers'),('logistics_vehicles','fleet'),('logistics_compartments','fleet'),('logistics_drivers','drivers'),('logistics_documents','vehicle_documents'),('logistics_seals','seals'),
('maintenance_assets','maintenance_assets'),('maintenance_plans','maintenance_plans'),('maintenance_work_orders','maintenance_work_orders'),('maintenance_parts','maintenance_work_orders'),
('hse_inspections','hse_inspections'),('hse_inspection_answers','hse_inspections'),('hse_events','hse_events'),('hse_nonconformities','hse_nonconformities'),('hse_safety_items','hse_safety'),('hse_checklists','hse_checklists'),('hse_checklist_items','hse_checklists'),('hse_agents','hse_agents')
) x(tbl,module) LOOP
EXECUTE format('CREATE POLICY "Granular action insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.has_permission(auth.uid(),%L))',r.tbl,r.module||'.create');
EXECUTE format('CREATE POLICY "Granular action update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.has_permission(auth.uid(),%L)) WITH CHECK(public.has_permission(auth.uid(),%L))',r.tbl,r.module||'.edit',r.module||'.edit');
END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.rbac_maintenance_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF auth.uid() IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN IF NEW.status='done' THEN PERFORM public.rbac_require_permission('maintenance_work_orders.complete'); ELSIF NEW.status='cancelled' THEN PERFORM public.rbac_require_permission('maintenance_work_orders.cancel'); END IF; END IF; RETURN NEW; END $$;
CREATE TRIGGER rbac_maintenance_status BEFORE UPDATE ON public.maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION public.rbac_maintenance_status_guard();
DO $$ DECLARE r record; def text; BEGIN FOR r IN SELECT * FROM (VALUES
('depot_supply_action','CASE _action WHEN ''create_proforma'' THEN ''depot_purchases.create_proforma'' WHEN ''issue_order'' THEN ''depot_purchases.issue_order'' WHEN ''set_payment_status'' THEN ''depot_purchases.set_payment_status'' WHEN ''create_lifting'' THEN ''lifting_orders.create'' WHEN ''sign_lifting'' THEN ''lifting_orders.sign_logistics'' WHEN ''cancel_lifting'' THEN ''lifting_orders.cancel'' ELSE ''supplies.validate'' END'),
('depot_po_edit','CASE WHEN _action=''delete'' THEN ''depot_purchases.delete_order'' ELSE ''depot_purchases.edit_order'' END'),
('depot_lifting_director_sign','''lifting_orders.sign_director'''),('logistics_trip_action','''transport.'' || _action'),('logistics_set_loads','''transport.set_loads'''),('logistics_confirm_site','''transport.confirm_site'''),('logistics_variance_action','''transport.'' || _action'),
('b2b_action','''b2b.'' || _action'),('fuel_card_action','''fuel_cards.'' || _action'),('account_closing_action','''account_closings.'' || _action'),('closure_transition','''sales.'' || _action'),('reject_index_entry','''index_entries.reject'''),
('workflow_action','''workflows.'' || _action'),('integration_action','CASE WHEN _action IN (''approve_destination'',''revoke_destination'') THEN ''integrations.manage'' ELSE ''integrations.'' || _action END'),('supply_transition','''supplies.'' || _action'),('reconciliation_action','''reconciliation.'' || _action'),('fraud_alert_action','''fraud.'' || _action'),('hse_action','CASE WHEN _entity=''inspection'' THEN ''hse_inspections.'' ELSE ''hse_nonconformities.'' END || _action')
) x(fn,expr) LOOP SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=r.fn; IF def IS NULL THEN RAISE EXCEPTION 'RPC absent : %',r.fn; END IF; EXECUTE regexp_replace(def,'\mBEGIN\M','BEGIN PERFORM public.rbac_require_permission('||r.expr||');','i'); END LOOP;
SELECT pg_get_functiondef('public.logistics_bl_action(text,uuid,jsonb)'::regprocedure) INTO def;
EXECUTE regexp_replace(def,'\mBEGIN\M','BEGIN IF public.get_user_tenant(auth.uid()) IS NOT NULL THEN PERFORM public.rbac_require_permission(CASE _action WHEN ''generate'' THEN ''delivery_notes.generate'' WHEN ''assign'' THEN ''delivery_notes.assign'' ELSE CASE _data->>''role'' WHEN ''shipper'' THEN ''delivery_notes.sign_shipper'' WHEN ''carrier'' THEN ''delivery_notes.sign_driver'' ELSE ''delivery_notes.sign_consignee'' END END); END IF;','i');
SELECT pg_get_functiondef('public.logistics_sign_cmr(uuid,text,text,text,text,text,text)'::regprocedure) INTO def;
EXECUTE regexp_replace(def,'\mBEGIN\M','BEGIN PERFORM public.rbac_require_permission(CASE _role WHEN ''shipper'' THEN ''ecmr.sign_shipper'' WHEN ''carrier'' THEN ''ecmr.sign_driver'' ELSE ''ecmr.sign_consignee'' END);','i'); END $$;
CREATE OR REPLACE FUNCTION public.rbac_save_role_permissions(_role uuid,_permission_ids uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.roles; ids uuid[]:=COALESCE(_permission_ids,'{}'); old_ids uuid[]; BEGIN
PERFORM public.rbac_require_permission('users.administer'); SELECT * INTO r FROM public.roles WHERE id=_role FOR UPDATE;
IF r.id IS NULL OR r.is_system OR r.tenant_id IS NULL OR (NOT public.is_platform_admin(auth.uid()) AND r.tenant_id IS DISTINCT FROM public.get_user_tenant(auth.uid())) THEN RAISE EXCEPTION 'Dupliquez le modèle fourni dans votre société'; END IF;
IF EXISTS(SELECT 1 FROM unnest(ids) id WHERE NOT EXISTS(SELECT 1 FROM public.permissions p WHERE p.id=id)) THEN RAISE EXCEPTION 'Permission inconnue'; END IF;
IF EXISTS(SELECT 1 FROM public.permissions p WHERE p.id=ANY(ids) AND cardinality(p.prerequisites)>0 AND NOT EXISTS(SELECT 1 FROM public.permissions parent WHERE parent.id=ANY(ids) AND parent.code=ANY(p.prerequisites))) THEN RAISE EXCEPTION 'Un droit commun requis manque'; END IF;
IF EXISTS(SELECT 1 FROM public.user_role_assignments WHERE user_id=auth.uid() AND role_id=_role) AND NOT EXISTS(SELECT 1 FROM public.permissions WHERE id=ANY(ids) AND code='users.administer') THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre droit d’administration'; END IF;
SELECT array_agg(permission_id) INTO old_ids FROM public.role_permissions WHERE role_id=_role;
DELETE FROM public.role_permissions WHERE role_id=_role AND NOT(permission_id=ANY(ids)); INSERT INTO public.role_permissions(role_id,permission_id) SELECT DISTINCT _role,id FROM unnest(ids) id ON CONFLICT DO NOTHING;
PERFORM public.audit_business_event('permissions_updated','users','role',_role::text,NULL,jsonb_build_object('before',old_ids,'after',ids),NULL); END $$;
REVOKE ALL ON FUNCTION public.rbac_save_role_permissions(uuid,uuid[]) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.rbac_save_role_permissions(uuid,uuid[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rbac_role_action(_action text,_tenant uuid,_role uuid DEFAULT NULL,_name text DEFAULT NULL,_description text DEFAULT NULL) RETURNS public.roles LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.roles; source public.roles; BEGIN
PERFORM public.rbac_require_permission('users.administer'); IF _tenant IS NULL OR (NOT public.is_platform_admin(auth.uid()) AND _tenant IS DISTINCT FROM public.get_user_tenant(auth.uid())) THEN RAISE EXCEPTION 'Société non autorisée'; END IF;
IF _action IN ('duplicate','delete') THEN SELECT * INTO source FROM public.roles WHERE id=_role FOR UPDATE; IF source.id IS NULL OR (source.tenant_id IS NOT NULL AND source.tenant_id<>_tenant) THEN RAISE EXCEPTION 'Profil non autorisé'; END IF; END IF;
IF _action='delete' THEN IF source.is_system OR source.tenant_id IS NULL OR EXISTS(SELECT 1 FROM public.user_role_assignments WHERE role_id=_role) THEN RAISE EXCEPTION 'Un modèle fourni ou un profil attribué ne peut pas être supprimé'; END IF; DELETE FROM public.role_permissions WHERE role_id=_role; DELETE FROM public.roles WHERE id=_role; r:=source;
ELSIF _action IN ('create','duplicate') THEN IF length(btrim(COALESCE(_name,'')))<2 OR length(_name)>100 THEN RAISE EXCEPTION 'Nom : 2 à 100 caractères'; END IF;
INSERT INTO public.roles(tenant_id,code,name,description,is_system,position) VALUES(_tenant,'custom_'||replace(gen_random_uuid()::text,'-',''),btrim(_name),_description,false,COALESCE(source.position,99)) RETURNING * INTO r;
IF _action='duplicate' THEN INSERT INTO public.role_permissions(role_id,permission_id) SELECT r.id,permission_id FROM public.role_permissions WHERE role_id=_role; END IF;
ELSE RAISE EXCEPTION 'Action inconnue'; END IF;
PERFORM public.audit_business_event('role_'||_action,'users','role',r.id::text,NULL,jsonb_build_object('name',r.name),NULL); RETURN r; END $$;
REVOKE ALL ON FUNCTION public.rbac_role_action(text,uuid,uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.rbac_role_action(text,uuid,uuid,text,text) TO authenticated,service_role;