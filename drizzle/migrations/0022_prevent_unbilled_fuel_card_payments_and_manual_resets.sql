CREATE OR REPLACE FUNCTION public.guard_fuel_credit_restoration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE covered numeric; restored numeric; BEGIN IF NEW.credit_used < OLD.credit_used THEN SELECT COALESCE(sum(paid),0) INTO covered FROM public.fuel_card_invoices WHERE account_id=OLD.id; SELECT COALESCE(sum(new_limit-old_limit),0) INTO restored FROM public.fuel_card_limit_events WHERE account_id=OLD.id AND reason LIKE 'Paiement facture %'; IF covered-restored < OLD.credit_used-NEW.credit_used THEN RAISE EXCEPTION 'Reconstitution sans facture réglée interdite'; END IF; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.fuel_card_action(_action text,_tenant uuid,_country uuid,_account uuid DEFAULT NULL,_card uuid DEFAULT NULL,_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $BODY$
DECLARE a public.fuel_card_accounts%ROWTYPE; c public.fuel_cards%ROWTYPE; sid uuid; pid uuid; vid uuid; did uuid; x numeric; n numeric; res uuid; j jsonb; ref text; inv public.fuel_card_invoices%ROWTYPE; oldval numeric; allowed text; k text; period text; v numeric; remaining_open numeric;
BEGIN
 IF auth.uid() IS NULL OR _tenant IS NULL OR _country IS NULL OR NOT public.can_access_tenant_country(auth.uid(),_tenant,_country) OR NOT public.is_module_enabled(_tenant,_country,'cartes_carburant') OR NOT public.tenant_write_allowed(_tenant) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 allowed:=CASE WHEN _action IN ('account','purchase') THEN 'fuel_cards.create' WHEN _action IN ('invoice','invoice_payment') THEN 'fuel_cards.validate' ELSE 'fuel_cards.edit' END;
 IF NOT (public.has_permission(auth.uid(),allowed) OR public.is_platform_admin(auth.uid())) THEN RAISE EXCEPTION 'Permission manquante: %',allowed; END IF;
 IF _account IS NOT NULL THEN SELECT * INTO a FROM public.fuel_card_accounts WHERE id=_account AND tenant_id=_tenant AND country_id=_country FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Compte introuvable'; END IF; END IF;
 IF _card IS NOT NULL THEN SELECT * INTO c FROM public.fuel_cards WHERE id=_card AND account_id=_account AND tenant_id=_tenant AND country_id=_country FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Carte hors compte'; END IF; END IF;
 IF _action='account' THEN
  IF _account IS NOT NULL OR _card IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.clients WHERE id=(_data->>'client_id')::uuid AND tenant_id=_tenant AND country_id=_country AND is_active) THEN RAISE EXCEPTION 'Client hors périmètre'; END IF;
  IF _data->>'kind' NOT IN ('prepaid','postpaid') THEN RAISE EXCEPTION 'Type invalide'; END IF;
  x:=COALESCE((_data->>'limit')::numeric,0); IF x<0 THEN RAISE EXCEPTION 'Plafond négatif'; END IF;
  IF _data->>'kind'='postpaid' AND (x<=0 OR nullif(trim(_data->>'contract_reference'),'') IS NULL) THEN RAISE EXCEPTION 'Contrat et plafond requis'; END IF;
  INSERT INTO public.fuel_card_accounts(tenant_id,country_id,client_id,kind,credit_limit,contract_reference) VALUES(_tenant,_country,(_data->>'client_id')::uuid,_data->>'kind',x,_data->>'contract_reference') RETURNING id INTO res;
 ELSIF _action='vehicle' THEN
  IF a.id IS NULL OR nullif(trim(_data->>'plate'),'') IS NULL THEN RAISE EXCEPTION 'Compte et immatriculation requis'; END IF;
  INSERT INTO public.fuel_card_vehicles(tenant_id,country_id,account_id,plate,description) VALUES(_tenant,_country,a.id,trim(_data->>'plate'),_data->>'description') RETURNING id INTO res;
 ELSIF _action='driver' THEN
  IF a.id IS NULL OR nullif(trim(_data->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Compte et nom requis'; END IF;
  INSERT INTO public.fuel_card_drivers(tenant_id,country_id,account_id,name,phone) VALUES(_tenant,_country,a.id,trim(_data->>'name'),_data->>'phone') RETURNING id INTO res;
 ELSIF _action='card' THEN
  IF a.status<>'active' OR nullif(trim(_data->>'number'),'') IS NULL OR (_data->>'expires_on')::date<=current_date THEN RAISE EXCEPTION 'Carte invalide'; END IF;
  vid:=nullif(_data->>'vehicle_id','')::uuid;did:=nullif(_data->>'driver_id','')::uuid;
  IF vid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fuel_card_vehicles WHERE id=vid AND account_id=a.id AND active) OR did IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fuel_card_drivers WHERE id=did AND account_id=a.id AND active) THEN RAISE EXCEPTION 'Véhicule ou conducteur hors compte'; END IF;
  INSERT INTO public.fuel_cards(tenant_id,country_id,account_id,card_number,holder_name,expires_on,vehicle_id,driver_id) VALUES(_tenant,_country,a.id,trim(_data->>'number'),_data->>'holder',(_data->>'expires_on')::date,vid,did) RETURNING id INTO res;
 ELSIF _action='status' THEN
  IF c.id IS NULL OR _data->>'status' NOT IN ('active','blocked') OR c.status IN ('expired','replaced') OR (_data->>'status'='active' AND c.expires_on<current_date) THEN RAISE EXCEPTION 'Transition interdite'; END IF;
  UPDATE public.fuel_cards SET status=_data->>'status' WHERE id=c.id;res:=c.id;
 ELSIF _action='replace' THEN
  IF c.id IS NULL OR c.status IN ('expired','replaced') OR nullif(trim(_data->>'number'),'') IS NULL OR (_data->>'expires_on')::date<=current_date THEN RAISE EXCEPTION 'Remplacement invalide'; END IF;
  INSERT INTO public.fuel_cards(tenant_id,country_id,account_id,card_number,holder_name,expires_on,vehicle_id,driver_id,restrictions,allocated_limit,remaining) VALUES(_tenant,_country,a.id,trim(_data->>'number'),c.holder_name,(_data->>'expires_on')::date,c.vehicle_id,c.driver_id,c.restrictions,c.allocated_limit,c.remaining) RETURNING id INTO res;
  UPDATE public.fuel_cards SET status='replaced',remaining=0,replaced_by=res WHERE id=c.id;
 ELSIF _action IN ('topup','allocate','return','limit') THEN
  x:=(_data->>'amount')::numeric;IF x IS NULL OR x<=0 THEN RAISE EXCEPTION 'Montant positif requis'; END IF;
  IF _action='topup' THEN IF a.kind<>'prepaid' THEN RAISE EXCEPTION 'Compte non prépayé'; END IF;
   UPDATE public.fuel_card_accounts SET prepaid_balance=prepaid_balance+x WHERE id=a.id;
  ELSIF _action='limit' THEN IF a.kind<>'postpaid' OR nullif(trim(_data->>'reason'),'') IS NULL OR x<a.credit_used OR x<(SELECT COALESCE(sum(remaining),0) FROM public.fuel_cards WHERE account_id=a.id) THEN RAISE EXCEPTION 'Plafond ou motif invalide'; END IF;
   UPDATE public.fuel_card_accounts SET credit_limit=x WHERE id=a.id;
   INSERT INTO public.fuel_card_limit_events(tenant_id,country_id,account_id,old_limit,new_limit,reason,actor_id) VALUES(_tenant,_country,a.id,a.credit_limit,x,_data->>'reason',auth.uid());
  ELSE IF c.id IS NULL OR c.status<>'active' OR c.expires_on<current_date THEN RAISE EXCEPTION 'Carte inactive'; END IF;
   IF _action='allocate' THEN
    IF a.status<>'active' OR x>(CASE WHEN a.kind='prepaid' THEN a.prepaid_balance ELSE a.credit_limit-a.credit_used END)-(SELECT COALESCE(sum(remaining),0) FROM public.fuel_cards WHERE account_id=a.id) THEN RAISE EXCEPTION 'Réserve insuffisante'; END IF;
    UPDATE public.fuel_cards SET allocated_limit=allocated_limit+x,remaining=remaining+x WHERE id=c.id;
    INSERT INTO public.fuel_card_limit_events(tenant_id,country_id,account_id,card_id,old_limit,new_limit,reason,actor_id) VALUES(_tenant,_country,a.id,c.id,c.allocated_limit,c.allocated_limit+x,COALESCE(nullif(_data->>'reason',''),'Allocation'),auth.uid());
   ELSE IF x>c.remaining THEN RAISE EXCEPTION 'Allocation insuffisante'; END IF;
    UPDATE public.fuel_cards SET allocated_limit=allocated_limit-x,remaining=remaining-x WHERE id=c.id;
    INSERT INTO public.fuel_card_limit_events(tenant_id,country_id,account_id,card_id,old_limit,new_limit,reason,actor_id) VALUES(_tenant,_country,a.id,c.id,c.allocated_limit,c.allocated_limit-x,COALESCE(nullif(_data->>'reason',''),'Restitution'),auth.uid());
   END IF;
  END IF;
  IF _action IN ('topup','allocate','return') THEN INSERT INTO public.fuel_card_transactions(tenant_id,country_id,account_id,card_id,kind,amount,note,actor_id) VALUES(_tenant,_country,a.id,_card,CASE WHEN _action='return' THEN 'allocation_return' WHEN _action='allocate' THEN 'allocation' ELSE 'topup' END,x,_data->>'reason',auth.uid()) RETURNING id INTO res;END IF;
 ELSIF _action='restrictions' THEN
  IF c.id IS NULL OR c.status='replaced' OR jsonb_typeof(_data->'restrictions') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Restrictions invalides'; END IF;
  j:=_data->'restrictions';
  FOR k IN SELECT jsonb_object_keys(j) LOOP IF k NOT IN ('products','stations','vehicles','max_transaction','max_litres','daily_amount','weekly_amount','monthly_amount','daily_litres','weekly_litres','monthly_litres','start_hour','end_hour') THEN RAISE EXCEPTION 'Restriction inconnue'; END IF; END LOOP;
  FOREACH k IN ARRAY ARRAY['max_transaction','max_litres','daily_amount','weekly_amount','monthly_amount','daily_litres','weekly_litres','monthly_litres','start_hour','end_hour'] LOOP IF j ? k AND ((j->>k)::numeric<0 OR (k IN ('start_hour','end_hour') AND (j->>k)::int>23)) THEN RAISE EXCEPTION 'Restriction invalide'; END IF; END LOOP;
  FOREACH k IN ARRAY ARRAY['products','stations','vehicles'] LOOP IF j ? k AND jsonb_typeof(j->k)<>'array' THEN RAISE EXCEPTION 'Liste invalide'; END IF; END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(j->'products','[]'::jsonb)) q WHERE NOT EXISTS(SELECT 1 FROM public.petroleum_products p WHERE p.id=q.value::uuid AND p.tenant_id=_tenant AND p.country_id=_country)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(j->'stations','[]'::jsonb)) q WHERE NOT EXISTS(SELECT 1 FROM public.stations s WHERE s.id=q.value::uuid AND s.tenant_id=_tenant AND s.country_id=_country)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(j->'vehicles','[]'::jsonb)) q WHERE NOT EXISTS(SELECT 1 FROM public.fuel_card_vehicles v WHERE v.id=q.value::uuid AND v.account_id=a.id)) THEN RAISE EXCEPTION 'Restriction hors périmètre'; END IF;
  UPDATE public.fuel_cards SET restrictions=j WHERE id=c.id;res:=c.id;
 ELSIF _action='purchase' THEN
  IF a.status<>'active' OR c.status<>'active' OR c.expires_on<current_date THEN RAISE EXCEPTION 'Compte ou carte inactive'; END IF;
  x:=(_data->>'amount')::numeric;n:=(_data->>'litres')::numeric;
  IF x IS NULL OR n IS NULL OR x<=0 OR n<=0 THEN RAISE EXCEPTION 'Montant et volume positifs requis'; END IF;
  sid:=(_data->>'station_id')::uuid;pid:=(_data->>'product_id')::uuid;vid:=nullif(_data->>'vehicle_id','')::uuid;did:=nullif(_data->>'driver_id','')::uuid;ref:=nullif(trim(_data->>'reference'),'');
  IF ref IS NULL OR NOT EXISTS(SELECT 1 FROM public.stations WHERE id=sid AND tenant_id=_tenant AND country_id=_country) OR NOT EXISTS(SELECT 1 FROM public.petroleum_products WHERE id=pid AND tenant_id=_tenant AND country_id=_country) THEN RAISE EXCEPTION 'Station, produit ou référence invalide'; END IF;
  IF c.vehicle_id IS NOT NULL AND c.vehicle_id IS DISTINCT FROM vid OR c.driver_id IS NOT NULL AND c.driver_id IS DISTINCT FROM did THEN RAISE EXCEPTION 'Véhicule ou conducteur non autorisé'; END IF;
  IF vid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fuel_card_vehicles WHERE id=vid AND account_id=a.id AND active) OR did IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fuel_card_drivers WHERE id=did AND account_id=a.id AND active) THEN RAISE EXCEPTION 'Véhicule ou conducteur invalide'; END IF;
  j:=c.restrictions;
  IF j ? 'products' AND jsonb_array_length(j->'products')>0 AND NOT (j->'products' ? pid::text) OR j ? 'stations' AND jsonb_array_length(j->'stations')>0 AND NOT (j->'stations' ? sid::text) OR j ? 'vehicles' AND jsonb_array_length(j->'vehicles')>0 AND (vid IS NULL OR NOT (j->'vehicles' ? vid::text)) THEN RAISE EXCEPTION 'Produit, station ou véhicule non autorisé'; END IF;
  IF j ? 'max_transaction' AND x>(j->>'max_transaction')::numeric OR j ? 'max_litres' AND n>(j->>'max_litres')::numeric THEN RAISE EXCEPTION 'Plafond transaction dépassé'; END IF;
  IF j ? 'start_hour' AND extract(hour FROM now() AT TIME ZONE 'UTC')<(j->>'start_hour')::numeric OR j ? 'end_hour' AND extract(hour FROM now() AT TIME ZONE 'UTC')>=(j->>'end_hour')::numeric THEN RAISE EXCEPTION 'Hors horaires autorisés (UTC)'; END IF;
  FOREACH period IN ARRAY ARRAY['daily','weekly','monthly'] LOOP
   IF period='daily' THEN k:='day'; ELSIF period='weekly' THEN k:='week'; ELSE k:='month'; END IF;
   IF j ? (period||'_amount') OR j ? (period||'_litres') THEN
    SELECT COALESCE(sum(amount),0),COALESCE(sum(litres),0) INTO v,remaining_open FROM public.fuel_card_transactions WHERE card_id=c.id AND kind='purchase' AND occurred_at>=date_trunc(k,now());
    IF j ? (period||'_amount') AND v+x>(j->>(period||'_amount'))::numeric OR j ? (period||'_litres') AND remaining_open+n>(j->>(period||'_litres'))::numeric THEN RAISE EXCEPTION 'Plafond périodique dépassé'; END IF;
   END IF;
  END LOOP;
  IF c.allocated_limit>0 AND x>c.remaining OR c.allocated_limit=0 AND EXISTS(SELECT 1 FROM public.fuel_cards WHERE account_id=a.id AND allocated_limit>0) THEN RAISE EXCEPTION 'Allocation carte insuffisante'; END IF;
  IF a.kind='prepaid' THEN IF a.prepaid_balance<x THEN RAISE EXCEPTION 'Solde principal insuffisant'; END IF;UPDATE public.fuel_card_accounts SET prepaid_balance=prepaid_balance-x WHERE id=a.id;
  ELSE IF a.credit_limit-a.credit_used<x THEN RAISE EXCEPTION 'Plafond principal dépassé'; END IF;UPDATE public.fuel_card_accounts SET credit_used=credit_used+x WHERE id=a.id;END IF;
  IF c.allocated_limit>0 THEN UPDATE public.fuel_cards SET remaining=remaining-x WHERE id=c.id;END IF;
  INSERT INTO public.fuel_card_transactions(tenant_id,country_id,account_id,card_id,station_id,product_id,vehicle_id,driver_id,kind,amount,litres,reference,actor_id) VALUES(_tenant,_country,a.id,c.id,sid,pid,vid,did,'purchase',x,n,ref,auth.uid()) RETURNING id INTO res;
  IF x>=100000 THEN INSERT INTO public.fuel_card_alerts(tenant_id,country_id,account_id,card_id,transaction_id,rule_code,explanation,severity) VALUES(_tenant,_country,a.id,c.id,res,'high_value','Transaction de montant élevé : '||x,'warning');END IF;
  IF (SELECT count(*) FROM public.fuel_card_transactions WHERE card_id=c.id AND kind='purchase' AND occurred_at>now()-interval '10 minutes')>=3 THEN INSERT INTO public.fuel_card_alerts(tenant_id,country_id,account_id,card_id,transaction_id,rule_code,explanation,severity) VALUES(_tenant,_country,a.id,c.id,res,'rapid_repeat','Au moins 3 achats en 10 minutes','high');END IF;
 ELSIF _action='invoice' THEN
  IF a.kind<>'postpaid' OR (_data->>'period_start')::date IS NULL OR (_data->>'period_end')::date<(_data->>'period_start')::date OR (_data->>'period_end')::date>current_date THEN RAISE EXCEPTION 'Période invalide'; END IF;
  IF EXISTS(SELECT 1 FROM public.fuel_card_invoices WHERE account_id=a.id AND period_start<=(_data->>'period_end')::date AND period_end>=(_data->>'period_start')::date) THEN RAISE EXCEPTION 'Période déjà facturée'; END IF;
  SELECT COALESCE(sum(amount),0) INTO x FROM public.fuel_card_transactions WHERE account_id=a.id AND kind='purchase' AND occurred_at::date BETWEEN (_data->>'period_start')::date AND (_data->>'period_end')::date;
  IF x<=0 THEN RAISE EXCEPTION 'Aucune consommation à facturer'; END IF;
  INSERT INTO public.fuel_card_invoices(tenant_id,country_id,account_id,period_start,period_end,number,amount,actor_id) VALUES(_tenant,_country,a.id,(_data->>'period_start')::date,(_data->>'period_end')::date,'FC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),x,auth.uid()) RETURNING id INTO res;
  INSERT INTO public.fuel_card_transactions(tenant_id,country_id,account_id,kind,amount,reference,actor_id) VALUES(_tenant,_country,a.id,'invoice',x,res::text,auth.uid());
 ELSIF _action='invoice_payment' THEN
  SELECT * INTO inv FROM public.fuel_card_invoices WHERE id=(_data->>'invoice_id')::uuid AND account_id=a.id AND tenant_id=_tenant AND country_id=_country FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  x:=(_data->>'amount')::numeric;IF x IS NULL OR x<=0 OR inv.paid+x>inv.amount THEN RAISE EXCEPTION 'Paiement invalide'; END IF;
  IF COALESCE(_data->>'restore','false')='true' AND (a.kind<>'postpaid' OR x>a.credit_used) THEN RAISE EXCEPTION 'Reconstitution invalide'; END IF;
  UPDATE public.fuel_card_invoices SET paid=paid+x WHERE id=inv.id;
  INSERT INTO public.fuel_card_transactions(tenant_id,country_id,account_id,kind,amount,reference,actor_id) VALUES(_tenant,_country,a.id,'payment',x,inv.id::text,auth.uid()) RETURNING id INTO res;
  IF COALESCE(_data->>'restore','false')='true' THEN
   UPDATE public.fuel_card_accounts SET credit_used=credit_used-x WHERE id=a.id;
   INSERT INTO public.fuel_card_limit_events(tenant_id,country_id,account_id,old_limit,new_limit,reason,actor_id) VALUES(_tenant,_country,a.id,a.credit_limit-a.credit_used,a.credit_limit-a.credit_used+x,'Paiement facture '||inv.number,auth.uid());
  END IF;
 ELSE RAISE EXCEPTION 'Action inconnue'; END IF;
 PERFORM public.log_audit_event('fuel_card_'||_action,'fuel_cards',CASE WHEN _card IS NULL THEN 'fuel_card_accounts' ELSE 'fuel_cards' END,COALESCE(res,_card,_account)::text,_country,jsonb_build_object('account_id',_account,'card_id',_card,'action',_action,'amount',_data->'amount'),NULL);
 RETURN jsonb_build_object('ok',true,'id',res);
END $BODY$;
REVOKE ALL ON FUNCTION public.fuel_card_action(text,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fuel_card_action(text,uuid,uuid,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fuel_card_action(text,uuid,uuid,uuid,uuid,jsonb) TO service_role;