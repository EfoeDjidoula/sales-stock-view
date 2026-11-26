/**
 * Mode démo : tout appel au serveur est intercepté dans le navigateur et servi
 * depuis demoData. Rien n'est envoyé ni écrit dans la base réelle.
 * Doit être importé avant le client serveur (premier import de main.tsx).
 */
import { toast } from "sonner";
import { buildDemoDb, DEMO_PROFILES, permissionsFor, TENANT, type DemoRole } from "./demoData";

const FLAG = "lumatek-demo-role";
const SERVER = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const TOKEN_KEY = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;

export const getDemoRole = (): DemoRole | null => {
  try {
    const r = localStorage.getItem(FLAG);
    return r === "admin" || r === "operator" || r === "manager" ? r : null;
  } catch { return null; }
};
export const isDemoMode = () => getDemoRole() !== null;

const demoUser = (role: DemoRole) => {
  const p = DEMO_PROFILES[role];
  return { id: p.userId, aud: "authenticated", role: "authenticated", email: p.email, app_metadata: { provider: "demo" }, user_metadata: { full_name: p.name }, created_at: new Date().toISOString() };
};

const wipeCaches = async () => {
  try { const { clearOfflineCache } = await import("@/lib/offlineCache"); await clearOfflineCache(); } catch { /* ignore */ }
};

/** Entre en démo (ou change de profil) puis recharge l'app sur le tableau de bord. */
export const startDemo = async (role: DemoRole) => {
  await wipeCaches();
  localStorage.setItem(FLAG, role);
  const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 31536000, expires_at: exp, user: demoUser(role) }));
  localStorage.removeItem("lumatek.selectedTenantId");
  window.location.replace("/");
};

export const exitDemo = async () => {
  await wipeCaches();
  localStorage.removeItem(FLAG);
  localStorage.removeItem(TOKEN_KEY);
  window.location.replace("/auth");
};

// ---------- Moteur de requêtes simulé ----------
let db: Record<string, any[]> | null = null;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let lastToast = 0;
const simulated = (what: string) => {
  if (Date.now() - lastToast < 1500) return;
  lastToast = Date.now();
  toast.success("Simulation réussie (mode démo)", { description: `${what} — rien n'a été enregistré dans la base réelle.` });
};

const singular = (t: string) => t.replace(/ies$/, "y").replace(/s$/, "");
const cast = (v: string) => (v === "null" ? null : v === "true" ? true : v === "false" ? false : v);
const cmp = (a: any, b: any) => (typeof a === "number" ? a - Number(b) : String(a ?? "").localeCompare(String(b)));

const test = (row: any, col: string, expr: string): boolean => {
  const neg = expr.startsWith("not.");
  if (neg) expr = expr.slice(4);
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot), raw = decodeURIComponent(expr.slice(dot + 1));
  const v = col.includes("->") ? undefined : row[col];
  let ok = true;
  switch (op) {
    case "eq": ok = String(v) === String(cast(raw)); break;
    case "neq": ok = String(v) !== String(cast(raw)); break;
    case "gt": ok = v != null && cmp(v, raw) > 0; break;
    case "gte": ok = v != null && cmp(v, raw) >= 0; break;
    case "lt": ok = v != null && cmp(v, raw) < 0; break;
    case "lte": ok = v != null && cmp(v, raw) <= 0; break;
    case "is": ok = raw === "null" ? v == null : String(v) === raw; break;
    case "in": ok = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(v)); break;
    case "like": case "ilike": ok = new RegExp("^" + raw.replace(/[%*]/g, ".*") + "$", "i").test(String(v ?? "")); break;
    default: ok = true;
  }
  return neg ? !ok : ok;
};

const embedsOf = (select: string) => {
  const out: { key: string; table: string }[] = [];
  let depth = 0, tok = "";
  for (const ch of select) {
    if (ch === "(") { if (depth === 0) { const m = tok.trim().match(/^(?:(\w+):)?(\w+)(?:!\w+)?$/); if (m) out.push({ key: m[1] || m[2], table: m[2] }); } depth++; }
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) tok = "";
    else if (depth === 0) tok += ch;
    if (ch === ",") tok = "";
  }
  return out;
};

const readTable = (table: string, params: URLSearchParams) => {
  let rows = [...(db![table] ?? [])];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"].includes(k)) continue;
    rows = rows.filter((r) => test(r, k, v));
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((o) => o.split("."));
    rows.sort((a, b) => { for (const [c, dir] of keys) { const x = cmp(a[c] ?? "", b[c] ?? ""); if (x) return dir === "desc" ? -x : x; } return 0; });
  }
  const total = rows.length;
  const off = Number(params.get("offset") || 0), lim = params.get("limit");
  rows = rows.slice(off, lim ? off + Number(lim) : undefined);
  const embeds = embedsOf(params.get("select") || "");
  if (embeds.length) rows = rows.map((r) => {
    const o = { ...r };
    for (const e of embeds) {
      const fk = `${singular(e.table)}_id`;
      if (fk in r) o[e.key] = (db![e.table] ?? []).find((x) => x.id === r[fk]) ?? null;
      else o[e.key] = (db![e.table] ?? []).filter((x) => x[`${singular(table)}_id`] === r.id);
    }
    // Nested PO → pro-forma → lines/supplier/depot relations used by depot stock and lifting orders.
    if (table === "depot_purchase_orders" && r.proforma_id) {
      const pf = (db!.depot_proformas ?? []).find((proforma) => proforma.id === r.proforma_id);
      o.depot_proformas = pf ? {
        ...pf,
        depot_proforma_lines: (db!.depot_proforma_lines ?? []).filter((line) => line.proforma_id === pf.id),
        suppliers: (db!.suppliers ?? []).find((supplier) => supplier.id === pf.supplier_id) ?? null,
        depots: (db!.depots ?? []).find((depot) => depot.id === pf.depot_id) ?? null,
      } : null;
    }
    return o;
  });
  return { rows, total, off };
};

const READ_RPC = /^(get_|is_|has_|can_|tenant_license_state|.*overview|.*availability|.*_state$|b2b_portal_me)/;
const rpc = (name: string, role: DemoRole) => {
  switch (name) {
    case "get_user_role": return role;
    case "get_user_tenant": return TENANT;
    case "get_user_permissions": return permissionsFor(role).map((code) => ({ code }));
    case "has_permission": return true;
    case "is_platform_admin": return false;
    case "is_module_enabled": case "can_access_tenant": case "can_access_tenant_country": case "can_write_module": case "can_write_station": return true;
    case "tenant_license_state": return { tenant_status: "active", mode: "full", has_license: true, license_number: "DEMO-0001", plan_name: "Enterprise (démo)", status: "active", expiration_date: "2099-12-31", grace_end: null, days_left: 9999, expiry_policy: "read_only", max_users: 100, max_countries: 10, max_stations: 100, users: 3, countries: 1, stations: 4 };
    case "logistics_vehicle_availability": {
      const busy = new Set((db?.logistics_trips ?? []).filter((t: any) => !["delivered", "cancelled"].includes(t.status)).flatMap((t: any) => [t.truck_id, t.tanker_id]));
      return (db?.logistics_vehicles ?? []).map((v: any) => ({ vehicle_id: v.id, registration: v.registration, kind: v.kind, capacity: v.capacity_litres, available: !busy.has(v.id), reasons: busy.has(v.id) ? ["Transport en cours"] : [] }));
    }
    case "logistics_driver_availability": {
      const busy = new Set((db?.logistics_trips ?? []).filter((t: any) => !["delivered", "cancelled"].includes(t.status)).map((t: any) => t.driver_id));
      return (db?.logistics_drivers ?? []).map((x: any) => ({ driver_id: x.id, full_name: x.full_name, available: !busy.has(x.id), reasons: busy.has(x.id) ? ["Transport en cours"] : [] }));
    }
    default: return null;
  }
};

const handle = async (url: URL, init: RequestInit | undefined, req: Request | null): Promise<Response> => {
  const role = getDemoRole()!;
  db ??= buildDemoDb(role);
  const method = (init?.method || req?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers || req?.headers);
  const path = url.pathname;

  if (path.startsWith("/auth/v1/")) {
    if (path.endsWith("/logout")) { localStorage.removeItem(FLAG); return new Response(null, { status: 204 }); }
    if (path.endsWith("/user")) return json(demoUser(role));
    return json({ access_token: "demo", token_type: "bearer", expires_in: 31536000, refresh_token: "demo", user: demoUser(role) });
  }
  if (path.startsWith("/functions/v1/")) { simulated("Action serveur simulée"); return json({ success: true, ok: true, demo: true }); }
  if (path.startsWith("/storage/v1/")) return json([], 200);
  if (path.startsWith("/rest/v1/rpc/")) {
    const name = path.split("/").pop()!;
    if (!READ_RPC.test(name)) simulated("Opération simulée");
    return json(rpc(name, role));
  }
  if (path.startsWith("/rest/v1/")) {
    const table = path.split("/")[3];
    const single = (headers.get("Accept") || "").includes("vnd.pgrst.object");
    if (method === "GET" || method === "HEAD") {
      const { rows, total, off } = readTable(table, url.searchParams);
      const range = { "Content-Range": `${rows.length ? `${off}-${off + rows.length - 1}` : "*"}/${total}` };
      if (method === "HEAD") return new Response(null, { status: 200, headers: range });
      if (single) return rows.length ? json(rows[0], 200, range) : json({ code: "PGRST116", message: "Aucune ligne (démo)", details: "", hint: "" }, 406);
      return json(rows, 200, range);
    }
    simulated(method === "DELETE" ? "Suppression simulée" : "Enregistrement simulé");
    let body: any = [];
    try { const raw = init?.body ?? (req ? await req.clone().text() : null); body = raw ? JSON.parse(String(raw)) : []; } catch { body = []; }
    const list = (Array.isArray(body) ? body : [body]).map((r: any) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
    return single ? json(list[0] ?? {}) : json(list, 201);
  }
  return json({});
};

/** Installe l'interception si le mode démo est actif. */
export const installDemoFetch = () => {
  if (!isDemoMode() || !SERVER) return;
  const realFetch = window.fetch.bind(window);
  const origin = new URL(SERVER).origin;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.href);
    if (url.origin === origin) return handle(url, init, req);
    return realFetch(input as RequestInfo, init);
  };
  // Les connexions temps réel ne doivent jamais atteindre le serveur réel
  const RealWS = window.WebSocket;
  window.WebSocket = new Proxy(RealWS, {
    construct(target, args: [string | URL, ...any[]]) {
      if (String(args[0]).includes(new URL(SERVER).host)) return new target("wss://invalid.localhost");
      return new target(...(args as [string]));
    },
  });
};
