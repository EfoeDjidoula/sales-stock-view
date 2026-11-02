DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

INSERT INTO public.license_modules(plan_id, module_key)
SELECT DISTINCT lm.plan_id, m.child FROM public.license_modules lm
JOIN (VALUES ('command_center','dashboard'),('bi','reporting'),('cloture','ventes'),('moteur_stock','stocks'),('reconciliation','ventes'),('logistique','livraisons'),('hse','stations'),('workflows','dashboard'),('proforma','commandes'),('exercices','dashboard'),('support','dashboard'),('api_hub','dashboard'),('integrations','dashboard')) m(child,parent)
  ON lm.module_key = m.parent
WHERE NOT EXISTS (SELECT 1 FROM public.license_modules x WHERE x.plan_id=lm.plan_id AND x.module_key=m.child);