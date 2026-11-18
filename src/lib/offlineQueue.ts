/**
 * Device-side queue for field entries made without network.
 * Items are replayed through the same server paths as online saves (RLS, triggers,
 * N+1 validation rules all still apply); nothing is written anywhere else.
 */
export type OfflineKind = "index_entry" | "supply_receive";

export interface OfflineOp {
  id: string;
  kind: OfflineKind;
  label: string;
  userId: string;
  createdAt: string;
  payload: Record<string, unknown>;
  error?: string;
}

const KEY = "lumatek.offlineOps";
export const OFFLINE_EVENT = "lumatek:offline-queue";

const read = (): OfflineOp[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const write = (items: OfflineOp[]) => {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(OFFLINE_EVENT));
};

export const offlineOps = {
  list: (userId?: string) => read().filter((o) => !userId || o.userId === userId),
  /** Adds or replaces (same kind + dedupeKey) so re-saving the same day keeps only the latest version. */
  add(op: Omit<OfflineOp, "id" | "createdAt">, dedupeKey?: string) {
    const id = dedupeKey ? `${op.kind}:${dedupeKey}` : `${op.kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const items = read().filter((o) => o.id !== id);
    write([...items, { ...op, id, createdAt: new Date().toISOString() }]);
    return id;
  },
  remove(id: string) {
    write(read().filter((o) => o.id !== id));
  },
  markError(id: string, error: string) {
    write(read().map((o) => (o.id === id ? { ...o, error } : o)));
  },
};

/** True when a failure is a lost connection (not a business/permission refusal). */
export const isNetworkError = (e: unknown): boolean => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg);
};

type Handler = (op: OfflineOp) => Promise<void>;
const handlers = new Map<OfflineKind, Handler>();
export const registerOfflineHandler = (kind: OfflineKind, fn: Handler) => handlers.set(kind, fn);

let running = false;
/** Replays the user's queued entries in order; stops at the first lost connection. */
export const replayOfflineOps = async (userId: string): Promise<{ sent: number; failed: number }> => {
  if (running) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const op of offlineOps.list(userId)) {
      const handler = handlers.get(op.kind);
      if (!handler) continue;
      try {
        await handler(op);
        offlineOps.remove(op.id);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        offlineOps.markError(op.id, e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
        failed++;
      }
    }
  } finally {
    running = false;
  }
  return { sent, failed };
};
