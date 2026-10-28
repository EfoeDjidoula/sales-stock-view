ALTER TABLE public.workflow_requests ADD COLUMN IF NOT EXISTS executed_at timestamptz, ADD COLUMN IF NOT EXISTS execution_result jsonb;

CREATE OR REPLACE FUNCTION public.workflow_validate_payload(_tenant uuid, _country uuid, _op text, _amount numeric, _volume numeric, _p jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE tk record; cur numeric;
BEGIN
  IF _op = 'stock_adjustment' THEN
    IF coalesce(_p->>'direction','') NOT IN ('in','out') THEN RAISE EXCEPTION 'Sens d''ajustement requis (entrée ou sortie)'; END IF;
    IF coalesce(_volume,0) <= 0 THEN RAISE EXCEPTION 'Volume d''ajustement requis'; END IF;
    SELECT t.id, t.station_id, t.product_id INTO tk FROM public.tanks t JOIN public.stations s ON s.id=t.station_id
      WHERE t.id = nullif(_p->>'tank_id','')::uuid AND s.tenant_id=_tenant AND s.country_id=_country;
    IF tk.id IS NULL OR tk.product_id IS NULL THEN RAISE EXCEPTION 'Cuve hors périmètre ou sans produit'; END IF;
  ELSIF _op = 'credit_limit_increase' THEN
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id=nullif(_p->>'client_id','')::uuid AND tenant_id=_tenant AND country_id=_country AND is_active) THEN
      RAISE EXCEPTION 'Client B2B hors périmètre ou inactif'; END IF;
    SELECT credit_limit INTO cur FROM public.b2b_terms WHERE client_id=(_p->>'client_id')::uuid AND tenant_id=_tenant AND country_id=_country ORDER BY effective_at DESC, created_at DESC LIMIT 1;
    IF cur IS NULL THEN RAISE EXCEPTION 'Configurez d''abord les conditions B2B du client'; END IF;
    IF coalesce(_amount,0) <= cur THEN RAISE EXCEPTION 'Le nouveau plafond (%) doit dépasser le plafond actuel (%)', _amount, cur; END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.workflow_validate_payload(uuid,uuid,text,numeric,numeric,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.workflow_request_validate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' OR (NEW.status='submitted' AND OLD.status='draft') THEN
    PERFORM public.workflow_validate_payload(NEW.tenant_id, NEW.country_id, NEW.operation_type, NEW.amount, NEW.volume, NEW.payload);
  END IF;
  IF TG_OP='UPDATE' AND OLD.executed_at IS NOT NULL AND (NEW.executed_at IS DISTINCT FROM OLD.executed_at OR NEW.execution_result IS DISTINCT FROM OLD.execution_result) THEN
    RAISE EXCEPTION 'Exécution déjà enregistrée'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_workflow_request_validate BEFORE INSERT OR UPDATE ON public.workflow_requests FOR EACH ROW EXECUTE FUNCTION public.workflow_request_validate();

CREATE OR REPLACE FUNCTION public.workflow_execute_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tk record; mv uuid; t public.b2b_terms; res jsonb; ref text := 'WF-' || upper(substr(NEW.id::text,1,8));
BEGIN
  IF NOT (NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.executed_at IS NULL) THEN RETURN NULL; END IF;
  IF NEW.operation_type = 'stock_adjustment' THEN
    PERFORM public.workflow_validate_payload(NEW.tenant_id, NEW.country_id, NEW.operation_type, NEW.amount, NEW.volume, NEW.payload);
    SELECT id, station_id, product_id INTO tk FROM public.tanks WHERE id=(NEW.payload->>'tank_id')::uuid;
    PERFORM set_config('lumatek.workflow_exec', NEW.id::text, true);
    INSERT INTO public.stock_movements(tenant_id,country_id,location_type,station_id,tank_id,product_id,movement_type,quantity,reason,reference)
      VALUES (NEW.tenant_id,NEW.country_id,'station',tk.station_id,tk.id,tk.product_id,
        CASE WHEN NEW.payload->>'direction'='in' THEN 'adjustment_in' ELSE 'adjustment_out' END, NEW.volume,
        'Approuvé par circuit : ' || NEW.title || coalesce(' — ' || NEW.description,''), ref)
      RETURNING id INTO mv;
    PERFORM set_config('lumatek.workflow_exec', '', true);
    res := jsonb_build_object('kind','stock_movement','id',mv,'quantity',NEW.volume,'direction',NEW.payload->>'direction');
  ELSIF NEW.operation_type = 'credit_limit_increase' THEN
    PERFORM public.workflow_validate_payload(NEW.tenant_id, NEW.country_id, NEW.operation_type, NEW.amount, NEW.volume, NEW.payload);
    SELECT * INTO t FROM public.b2b_terms WHERE client_id=(NEW.payload->>'client_id')::uuid AND tenant_id=NEW.tenant_id AND country_id=NEW.country_id ORDER BY effective_at DESC, created_at DESC LIMIT 1;
    INSERT INTO public.b2b_terms(tenant_id,country_id,client_id,contract_reference,credit_limit,payment_days,policy,alert_levels,negotiated_prices,site_ids,actor_id,reason)
      VALUES (t.tenant_id,t.country_id,t.client_id,t.contract_reference,NEW.amount,t.payment_days,t.policy,t.alert_levels,t.negotiated_prices,t.site_ids,coalesce(auth.uid(),NEW.requested_by),
        'Hausse de plafond approuvée (' || ref || ') : ' || t.credit_limit || ' → ' || NEW.amount)
      RETURNING id INTO mv;
    res := jsonb_build_object('kind','b2b_terms','id',mv,'previous_limit',t.credit_limit,'new_limit',NEW.amount);
  ELSE
    RETURN NULL;
  END IF;
  UPDATE public.workflow_requests SET executed_at=now(), execution_result=res WHERE id=NEW.id;
  PERFORM public.audit_business_event('workflow_execute', NEW.module, 'workflow_request', NEW.id::text, NEW.country_id, res, NULL);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_workflow_execute_after AFTER UPDATE OF status ON public.workflow_requests FOR EACH ROW EXECUTE FUNCTION public.workflow_execute_after();

CREATE OR REPLACE FUNCTION public.stock_movement_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  is_validator boolean := public.is_platform_admin(uid) OR public.has_permission(uid, 'stock.validate') OR EXISTS (SELECT 1 FROM public.workflow_requests w WHERE w.id::text = nullif(current_setting('lumatek.workflow_exec', true),'') AND w.status = 'approved' AND w.executed_at IS NULL);
  loc uuid;
  avail numeric;
  tk record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status <> 'pending' OR NEW.status NOT IN ('validated','rejected') THEN
      RAISE EXCEPTION 'Le registre des mouvements de stock est immuable';
    END IF;
    IF NOT is_validator THEN
      RAISE EXCEPTION 'Validation réservée aux utilisateurs autorisés (stock.validate)';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','validated_by','validated_at','validation_note'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','validated_by','validated_at','validation_note']) THEN
      RAISE EXCEPTION 'Seul le statut de validation peut être modifié';
    END IF;
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.status = 'validated' AND NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') THEN
      loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
      avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);
      IF NEW.quantity > avail THEN
        RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  SELECT NULL::uuid AS station_id, NULL::uuid AS product_id, NULL::numeric AS capacity_liters INTO tk;
  NEW.requested_by := uid;
  NEW.requested_by_name := (SELECT full_name FROM public.profiles WHERE user_id = uid);
  NEW.created_at := now();
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') AND COALESCE(btrim(NEW.reason), '') = '' THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour un ajustement ou un inventaire';
  END IF;
  IF NEW.movement_type = 'inventory' AND NEW.physical_level IS NULL THEN
    RAISE EXCEPTION 'Le niveau physique mesuré est obligatoire pour un inventaire';
  END IF;
  IF NEW.movement_type <> 'inventory' AND NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'La quantité doit être strictement positive';
  END IF;
  IF NEW.tank_id IS NOT NULL THEN
    SELECT station_id, product_id, capacity_liters INTO tk FROM public.tanks WHERE id = NEW.tank_id;
    IF NEW.location_type <> 'station' OR tk.station_id IS DISTINCT FROM NEW.station_id THEN
      RAISE EXCEPTION 'La cuve n''appartient pas à cette station';
    END IF;
    IF tk.product_id IS NOT NULL AND tk.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'Le produit ne correspond pas au produit de la cuve';
    END IF;
  END IF;
  loc := CASE WHEN NEW.location_type = 'station' THEN NEW.station_id ELSE NEW.depot_id END;
  avail := public.stock_theoretical(NEW.location_type, loc, NEW.tank_id, NEW.product_id);
  IF NEW.movement_type = 'inventory' THEN
    NEW.theoretical_at_count := avail;
    NEW.quantity := 0;
  END IF;
  IF NEW.movement_type IN ('adjustment_in','adjustment_out','inventory') THEN
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSIF NEW.movement_type = 'initial' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE movement_type = 'initial' AND status <> 'rejected'
               AND product_id = NEW.product_id AND tank_id IS NOT DISTINCT FROM NEW.tank_id
               AND station_id IS NOT DISTINCT FROM NEW.station_id AND depot_id IS NOT DISTINCT FROM NEW.depot_id) THEN
      RAISE EXCEPTION 'Un stock initial existe déjà : utilisez un ajustement';
    END IF;
    NEW.status := CASE WHEN is_validator THEN 'validated' ELSE 'pending' END;
  ELSE
    NEW.status := 'validated';
  END IF;
  IF NEW.status = 'validated' THEN
    NEW.validated_by := uid; NEW.validated_at := now();
    IF NEW.movement_type IN ('exit','sale','transfer_out','adjustment_out') AND NEW.quantity > avail THEN
      RAISE EXCEPTION 'Stock insuffisant : % L disponibles', avail;
    END IF;
    IF NEW.movement_type IN ('entry','transfer_in','initial','adjustment_in') AND tk.capacity_liters IS NOT NULL
       AND avail + NEW.quantity > tk.capacity_liters THEN
      RAISE EXCEPTION 'Capacité de la cuve dépassée (% L)', tk.capacity_liters;
    END IF;
  END IF;
  RETURN NEW;
END $function$;