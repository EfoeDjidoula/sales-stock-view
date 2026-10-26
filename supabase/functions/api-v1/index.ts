// LUMATEK API Hub — REST v1 (read-only). Auth: Authorization: Bearer lmtk_live_...
// Same rules as the app: tenant isolation, allowed active countries, scopes, license mode, module flags per country.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-lumatek-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type Route = { scope: string; module: string; table: string; select: string; dateCol?: string; order: string };
const ROUTES: Record<string, Route> = {
  stations: { scope: "stations:read", module: "stations", table: "stations", select: "id,name,location,status,country_id,zone_id,depot_id", order: "name" },
  products: { scope: "products:read", module: "stations", table: "petroleum_products", select: "id,code,name,category,status,country_id", order: "code" },
  stocks: { scope: "stocks:read", module: "stocks", table: "tanks", select: "id,name,station_id,product_id,product_type,capacity_liters,min_threshold,critical_threshold,status,country_id", order: "name" },
  sales: { scope: "sales:read", module: "ventes", table: "daily_closures", select: "id,station_id,closure_date,status,total_volume,total_amount,total_collected,cash_variance,country_id", dateCol: "closure_date", order: "closure_date" },
  orders: { scope: "orders:read", module: "commandes", table: "supply_requests", select: "id,reference,status,station_id,product_id,qty_requested,qty_approved,qty_loaded,qty_delivered,qty_received,delivery_variance,needed_date,country_id,created_at", dateCol: "created_at", order: "created_at" },
  deliveries: { scope: "deliveries:read", module: "livraisons", table: "logistics_trips", select: "id,reference,status,supply_request_id,planned_departure,eta,delivered_at,qty_loaded,qty_delivered,load_mode,country_id", dateCol: "created_at", order: "created_at" },
  "fuel-cards": { scope: "fuelcards:read", module: "cartes_carburant", table: "fuel_cards", select: "id,account_id,card_number,holder_name,status,expires_on,allocated_limit,remaining,country_id", order: "card_number" },
  "fuel-card-transactions": { scope: "fuelcards:read", module: "cartes_carburant", table: "fuel_card_transactions", select: "id,card_id,account_id,station_id,product_id,kind,amount,litres,reference,occurred_at,country_id", dateCol: "occurred_at", order: "occurred_at" },
  "b2b-clients": { scope: "b2b:read", module: "clients_b2b", table: "clients", select: "id,name,contact_name,phone,email,is_active,country_id", order: "name" },
  "b2b-invoices": { scope: "b2b:read", module: "clients_b2b", table: "b2b_invoices", select: "id,client_id,number,period_start,period_end,due_on,amount,country_id,created_at", dateCol: "created_at", order: "created_at" },
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, ...extra, "Content-Type": "application/json" } });

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const isDate = (v: string | null) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string | null) => !v || /^[0-9a-f-]{36}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/api-v1/, "").replace(/\/+$/, "") || "/";
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let keyId: string | null = null, tenantId: string | null = null;

  const done = async (status: number, body: unknown, extra: Record<string, string> = {}, rows?: number) => {
    await db.from("api_request_logs").insert({
      api_key_id: keyId, tenant_id: tenantId, method: req.method, endpoint: path.slice(0, 200), status_code: status,
      duration_ms: Date.now() - started, rows_returned: rows ?? null,
      error: status >= 400 ? String((body as { error?: string })?.error ?? "").slice(0, 500) : null,
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    });
    return json(status, body, { "X-Lumatek-Api-Version": "v1", ...extra });
  };

  if (path === "/" || path === "/v1") {
    return json(200, { name: "LUMATEK API", version: "v1", endpoints: Object.keys(ROUTES).map((r) => `/v1/${r}`).concat("/v1/reports/summary", "/v1/me") });
  }
  if (req.method !== "GET") return done(405, { error: "Méthode non autorisée (API v1 en lecture seule)" });

  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || req.headers.get("x-lumatek-api-key") || "";
  if (!/^lmtk_live_[0-9a-f]{48}$/.test(raw)) return done(401, { error: "Clé API manquante ou invalide" });
  const { data: key } = await db.from("api_keys").select("*").eq("key_hash", await sha256(raw)).maybeSingle();
  if (!key) return done(401, { error: "Clé API inconnue" });
  keyId = key.id; tenantId = key.tenant_id;
  if (key.status !== "active") return done(401, { error: "Clé API révoquée" });
  if (key.expires_at && new Date(key.expires_at) < new Date()) return done(401, { error: "Clé API expirée" });

  // Rate limiting (fixed 60 s window, counted from the call log)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("api_request_logs").select("id", { count: "exact", head: true }).eq("api_key_id", key.id).gte("created_at", since);
  const used = (count ?? 0) + 1;
  const rl = { "X-RateLimit-Limit": String(key.rate_limit_per_minute), "X-RateLimit-Remaining": String(Math.max(0, key.rate_limit_per_minute - used)) };
  if (used > key.rate_limit_per_minute) return done(429, { error: "Limite d'appels atteinte, réessayez dans une minute" }, { ...rl, "Retry-After": "60" });
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  // License (same state as the app)
  const { data: lic } = await db.rpc("tenant_license_state", { _tenant_id: key.tenant_id });
  const mode = (lic as { mode?: string } | null)?.mode;
  if (!lic || !["full", "grace", "read_only"].includes(mode ?? "")) return done(403, { error: "Licence inactive ou accès bloqué" }, rl);

  // Countries: key-allowed ∩ currently active for the tenant
  const { data: tcs } = await db.from("tenant_countries").select("country_id").eq("tenant_id", key.tenant_id).eq("is_active", true);
  const active = new Set((tcs ?? []).map((t) => t.country_id));
  let countries: string[] = (key.allowed_countries as string[]).filter((c) => active.has(c));
  const qCountry = url.searchParams.get("country_id");
  if (!isUuid(qCountry)) return done(400, { error: "country_id invalide" }, rl);
  if (qCountry) {
    if (!countries.includes(qCountry)) return done(403, { error: "Pays non autorisé pour cette clé" }, rl);
    countries = [qCountry];
  }

  const scopedCountries = async (module: string) => {
    const ok: string[] = [];
    for (const c of countries) {
      const { data } = await db.rpc("is_module_enabled", { _tenant_id: key.tenant_id, _country_id: c, _module_key: module });
      if (data) ok.push(c);
    }
    return ok;
  };

  if (path === "/v1/me") return done(200, { tenant_id: key.tenant_id, key: key.prefix, scopes: key.scopes, countries, license_mode: mode }, rl);

  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (!isDate(from) || !isDate(to)) return done(400, { error: "from/to au format AAAA-MM-JJ" }, rl);

  if (path === "/v1/reports/summary") {
    if (!key.scopes.includes("reports:read")) return done(403, { error: "Scope reports:read requis" }, rl);
    const cs = await scopedCountries("reporting");
    if (!cs.length) return done(403, { error: "Module reporting non licencié pour ces pays" }, rl);
    let q = db.from("daily_closures").select("country_id,total_volume,total_amount,status").eq("tenant_id", key.tenant_id).in("country_id", cs).neq("status", "rejected");
    if (from) q = q.gte("closure_date", from);
    if (to) q = q.lte("closure_date", to);
    const { data, error } = await q.limit(10000);
    if (error) return done(500, { error: "Erreur de lecture" }, rl);
    const by: Record<string, { volume: number; amount: number; closures: number }> = {};
    for (const r of data ?? []) {
      const b = (by[r.country_id] ??= { volume: 0, amount: 0, closures: 0 });
      b.volume += Number(r.total_volume ?? 0); b.amount += Number(r.total_amount ?? 0); b.closures++;
    }
    return done(200, { data: by, period: { from, to } }, rl, Object.keys(by).length);
  }

  const name = path.replace(/^\/v1\//, "");
  const route = ROUTES[name];
  if (!route) return done(404, { error: "Endpoint inconnu" }, rl);
  if (!key.scopes.includes(route.scope)) return done(403, { error: `Scope ${route.scope} requis` }, rl);
  const cs = await scopedCountries(route.module);
  if (!cs.length) return done(403, { error: `Module ${route.module} non licencié pour ces pays` }, rl);

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const station = url.searchParams.get("station_id");
  if (!isUuid(station)) return done(400, { error: "station_id invalide" }, rl);

  let q = db.from(route.table).select(route.select, { count: "exact" }).eq("tenant_id", key.tenant_id).in("country_id", cs);
  if (station && route.select.includes("station_id")) q = q.eq("station_id", station);
  if (route.dateCol && from) q = q.gte(route.dateCol, from);
  if (route.dateCol && to) q = q.lte(route.dateCol, route.dateCol === "closure_date" ? to : `${to}T23:59:59`);
  const { data, error, count: total } = await q.order(route.order, { ascending: !route.dateCol }).range(offset, offset + limit - 1);
  if (error) return done(500, { error: "Erreur de lecture" }, rl);
  return done(200, { data, pagination: { limit, offset, total } }, rl, data?.length ?? 0);
});
