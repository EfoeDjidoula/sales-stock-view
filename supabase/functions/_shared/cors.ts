// Restricts browser access to the app's own origins (production, Lovable previews, localhost).
const PROD = "https://sales-stock-view.lovable.app";

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.origin === PROD) return true;
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && (u.protocol === "http:" || u.protocol === "https:")) return true;
    if (u.protocol !== "https:") return false;
    return u.hostname.endsWith(".lovable.app") || u.hostname.endsWith(".lovableproject.com");
  } catch {
    return false;
  }
}

/** Static headers (no origin); the origin is added per request by withCors. */
export function baseCorsHeaders(extraAllowHeaders: string[] = []): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": ["authorization", "x-client-info", "apikey", "content-type",
      "x-supabase-client-platform", "x-supabase-client-platform-version", "x-supabase-client-runtime",
      "x-supabase-client-runtime-version", ...extraAllowHeaders].join(", "),
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

/** Wraps a handler: answers OPTIONS, then sets Allow-Origin only for approved origins. */
export function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const ok = isAllowedOrigin(origin);
    let res: Response;
    if (req.method === "OPTIONS") res = new Response(null, { status: ok ? 204 : 403 });
    else res = await handler(req);
    const headers = new Headers(res.headers);
    headers.delete("Access-Control-Allow-Origin");
    if (ok) headers.set("Access-Control-Allow-Origin", origin!);
    headers.append("Vary", "Origin");
    if (req.method === "OPTIONS") for (const [k, v] of Object.entries(baseCorsHeaders(["x-lovable-aig-run-id"]))) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
