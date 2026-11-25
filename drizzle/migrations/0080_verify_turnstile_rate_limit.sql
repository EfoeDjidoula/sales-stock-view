CREATE TABLE public.edge_rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
GRANT ALL ON public.edge_rate_limits TO service_role;
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.edge_rate_limit_hit(_bucket text, _limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _w timestamptz := date_trunc('minute', now()); _n integer;
BEGIN
  INSERT INTO public.edge_rate_limits(bucket, window_start, hits) VALUES (_bucket, _w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = edge_rate_limits.hits + 1
  RETURNING hits INTO _n;
  DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '10 minutes';
  RETURN _n <= _limit;
END $$;
REVOKE ALL ON FUNCTION public.edge_rate_limit_hit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_rate_limit_hit(text, integer) TO service_role;