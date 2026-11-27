DO $do$
DECLARE def text; old text := 'SELECT count(*)+1 INTO n FROM public.depot_purchase_orders WHERE tenant_id=t AND country_id=c AND date_part(''year'',issue_date)=date_part(''year'',CURRENT_DATE);';
BEGIN
  def := pg_get_functiondef('public.depot_supply_action'::regproc);
  IF position(old in def) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  def := replace(def, old, 'SELECT COALESCE(max((substring(number from ''-(\d+)$''))::int),0)+1 INTO n FROM public.depot_purchase_orders WHERE tenant_id=t AND country_id=c AND number LIKE ''BC-''||to_char(CURRENT_DATE,''YYYY'')||''-%'';');
  EXECUTE def;
END $do$;