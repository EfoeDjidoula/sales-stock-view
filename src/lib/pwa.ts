/**
 * Single registration point for the offline service worker (/sw.js).
 * Refuses (and cleans up) in dev, Lovable previews, iframes, or with ?sw=off,
 * so the editor preview never serves stale cached code.
 */
const PREVIEW_HOST_SUFFIXES = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const DEV_LABEL = /^project--[a-z0-9-]+-dev$/;

export const isServiceWorkerAllowed = (loc: Location = window.location, inIframe = window.self !== window.top): boolean => {
  if (!import.meta.env.PROD) return false;
  if (inIframe) return false;
  const host = loc.hostname.toLowerCase();
  const label = host.split(".")[0];
  if (PREVIEW_HOST_SUFFIXES.some((s) => host.endsWith(s)) && (PREVIEW_LABEL.test(label) || DEV_LABEL.test(label))) return false;
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (host === d || host.endsWith(`.${d}`)) return false;
  }
  if (new URLSearchParams(loc.search).has("sw") && new URLSearchParams(loc.search).get("sw") === "off") return false;
  return true;
};

const unregisterAppWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith("/sw.js")))
      .map((r) => r.unregister()),
  );
};

export const setupServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!isServiceWorkerAllowed()) {
    await unregisterAppWorkers().catch(() => undefined);
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({
    immediate: true,
    // Ask the browser to check for a new release regularly and whenever the app comes back to the foreground.
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      setInterval(check, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
    },
  });
};

/** A lazily loaded screen from a previous release is gone after a deploy: reload once onto the new version. */
export const setupStaleChunkRecovery = () => {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    const key = "lumatek:chunk-reload";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 30_000) return; // avoid reload loops
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  });
};
