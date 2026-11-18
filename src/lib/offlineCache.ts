import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

/** Screens already opened stay readable without network for this long. */
export const OFFLINE_CACHE_MAX_AGE = 3 * 24 * 60 * 60 * 1000;
const CACHE_KEY = "lumatek.queryCache";

export const createAppQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: OFFLINE_CACHE_MAX_AGE } } });

export const offlinePersister = createAsyncStoragePersister({
  key: CACHE_KEY,
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  throttleTime: 2000,
});

/** Called at sign-in and sign-out so one person's data never shows for the next. */
export const clearOfflineCache = () => del(CACHE_KEY).catch(() => undefined);
