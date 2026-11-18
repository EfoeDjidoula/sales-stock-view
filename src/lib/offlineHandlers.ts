import { supabase } from "@/integrations/supabase/client";
import { persistIndexEntry, type IndexEntryData } from "@/hooks/useIndexEntries";
import { registerOfflineHandler } from "@/lib/offlineQueue";

/** Replays queued field entries through the exact same server paths as online saves. */
registerOfflineHandler("index_entry", async (op) => {
  const { data, scope } = op.payload as { data: IndexEntryData; scope: Record<string, string> };
  await persistIndexEntry(data, op.userId, scope);
});

registerOfflineHandler("supply_receive", async (op) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("supply_transition", op.payload);
  if (error) throw error;
});
