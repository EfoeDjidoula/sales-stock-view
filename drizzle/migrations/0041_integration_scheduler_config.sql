CREATE TABLE public.integration_scheduler_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_scheduler_config TO service_role;
ALTER TABLE public.integration_scheduler_config ENABLE ROW LEVEL SECURITY;