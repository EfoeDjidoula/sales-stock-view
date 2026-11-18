/**
 * Robot check (Turnstile) runs only on the published app.
 * Skipped in dev, Lovable previews/console (incl. iframe) to keep the editor usable.
 */
export const isCaptchaRequired = (loc: Location = window.location, inIframe = window.self !== window.top): boolean => {
  if (!import.meta.env.PROD) return false;
  if (inIframe) return false;
  const host = loc.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return false;
  const label = host.split(".")[0];
  if (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--/.test(label) || /^project--[a-z0-9-]+-dev$/.test(label)) return false;
  for (const d of ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"]) {
    if (host === d || host.endsWith(`.${d}`)) return false;
  }
  return true;
};
