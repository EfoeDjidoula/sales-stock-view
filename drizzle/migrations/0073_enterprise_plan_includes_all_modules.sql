CREATE OR REPLACE FUNCTION public.enterprise_plan_auto_module()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.license_modules (plan_id, module_key)
  SELECT lp.id, NEW.key FROM public.license_plans lp
  WHERE lp.code = 'ENTERPRISE'
    AND NOT EXISTS (SELECT 1 FROM public.license_modules lm WHERE lm.plan_id = lp.id AND lm.module_key = NEW.key);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enterprise_plan_auto_module() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS modules_enterprise_auto ON public.modules;
CREATE TRIGGER modules_enterprise_auto AFTER INSERT ON public.modules
FOR EACH ROW EXECUTE FUNCTION public.enterprise_plan_auto_module();
INSERT INTO public.license_modules (plan_id, module_key)
SELECT lp.id, m.key FROM public.license_plans lp CROSS JOIN public.modules m
WHERE lp.code = 'ENTERPRISE' AND NOT m.is_core
  AND NOT EXISTS (SELECT 1 FROM public.license_modules lm WHERE lm.plan_id = lp.id AND lm.module_key = m.key);