DO $$
DECLARE d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['logistics_bl_action','logistics_bl_overview'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f;
    d := regexp_replace(d, 'is_module_enabled\(([^)]*),''logistique_avancee''\)', '(is_module_enabled(\1,''logistique'') OR is_module_enabled(\1,''logistique_avancee''))', 'g');
    EXECUTE d;
  END LOOP;
END $$;