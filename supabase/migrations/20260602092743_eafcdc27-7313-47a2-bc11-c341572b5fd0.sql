ALTER TABLE public.index_entries REPLICA IDENTITY FULL;
ALTER TABLE public.pump_index_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.index_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pump_index_entries;