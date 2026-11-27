import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

/** Screens already opened stay readable without network for this long. */
export const OFFLINE_CACHE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
/**
 * v2: stored as-is through IndexedDB structured clone (Set, Map and Date survive).
 * v1 went through JSON, which turned Sets into `{}` and broke `permissions.has`.
 */
const CACHE_KEY = "lumatek.queryCache.v2";
const LEGACY_KEYS = ["lumatek.queryCache"];
const THROTTLE_MS = 2000;

export const createAppQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: OFFLINE_CACHE_MAX_AGE, staleTime: 30_000, refetchOnWindowFocus: false } } });

let pending: PersistedClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export const offlinePersister: Persister = {
  persistClient: (client) => {
    pending = client;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const next = pending;
      pending = null;
      if (next) set(CACHE_KEY, next).catch(() => undefined);
    }, THROTTLE_MS);
  },
  restoreClient: async () => {
    LEGACY_KEYS.forEach((k) => del(k).catch(() => undefined));
    try {
      const stored = await get<PersistedClient>(CACHE_KEY);
      return stored && typeof stored === "object" ? stored : undefined;
    } catch {
      return undefined;
    }
  },
  removeClient: () => del(CACHE_KEY).catch(() => undefined),
};

/** Called at sign-in and sign-out so one person's data never shows for the next. */
export const clearOfflineCache = () => {
  pending = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return Promise.all([CACHE_KEY, ...LEGACY_KEYS].map((k) => del(k))).catch(() => undefined);
};
