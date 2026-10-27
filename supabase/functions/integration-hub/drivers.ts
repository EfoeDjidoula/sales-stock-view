// Provider-agnostic driver registry. Add a provider by registering a driver; no core change needed.
export type Ctx = { config: Record<string, unknown>; credentials: Record<string, string>; params: Record<string, unknown> };
export type Mapping = { entity: string; external_value: string; internal_value: string };
export type DriverResult = { ok: boolean; records?: number; detail?: unknown; error?: string; retryable?: boolean };
export type Driver = { test: (c: Ctx) => Promise<DriverResult>; pull?: (c: Ctx, m: Mapping[]) => Promise<DriverResult>; push?: (c: Ctx, m: Mapping[]) => Promise<DriverResult> };

function headers(c: Ctx): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const auth = String(c.config.auth ?? "bearer");
  const cr = c.credentials;
  if (auth === "bearer" && cr.token) h.Authorization = `Bearer ${cr.token}`;
  if (auth === "basic" && cr.username) h.Authorization = `Basic ${btoa(`${cr.username}:${cr.password ?? ""}`)}`;
  if (auth === "header" && cr.api_key) h[String(c.config.header_name ?? "X-API-Key")] = cr.api_key;
  return h;
}

async function call(c: Ctx, path: unknown, method = "GET", body?: unknown): Promise<{ res: Response; data: unknown }> {
  const base = String(c.config.base_url ?? "");
  if (!/^https:\/\//.test(base)) throw Object.assign(new Error("base_url HTTPS requise dans la configuration"), { retryable: false });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(c.config.timeout_ms ?? 15000));
  try {
    const res = await fetch(base.replace(/\/$/, "") + String(path ?? "/"), {
      method, signal: ctrl.signal, headers: { ...headers(c), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    return { res, data };
  } finally { clearTimeout(t); }
}

const fail = (res: Response): DriverResult => ({ ok: false, error: `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 });

/** Applies field/value mappings: renames external fields and translates codes. */
export function applyMappings(row: Record<string, unknown>, m: Mapping[]) {
  const out: Record<string, unknown> = {};
  const fields = new Map(m.filter((x) => x.entity === "field").map((x) => [x.external_value, x.internal_value]));
  const values = m.filter((x) => x.entity !== "field");
  for (const [k, v] of Object.entries(row)) {
    const key = fields.get(k) ?? k;
    const hit = values.find((x) => x.external_value === String(v));
    out[key] = hit ? hit.internal_value : v;
  }
  return out;
}

export const genericRest: Driver = {
  async test(c) {
    const { res } = await call(c, c.config.test_path ?? "/");
    return res.ok ? { ok: true, detail: { status: res.status } } : fail(res);
  },
  async pull(c, m) {
    const { res, data } = await call(c, c.config.pull_path ?? "/", "GET");
    if (!res.ok) return fail(res);
    const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.data) ? (data as any).data : [];
    const mapped = rows.slice(0, 5000).map((r: Record<string, unknown>) => applyMappings(r, m));
    return { ok: true, records: mapped.length, detail: { sample: mapped.slice(0, 3) } };
  },
  async push(c) {
    const { res } = await call(c, c.config.push_path ?? "/", "POST", c.params.payload ?? {});
    return res.ok ? { ok: true, records: 1 } : fail(res);
  },
};

// Specific providers reuse the generic HTTP driver until a dedicated adapter is written.
const registry: Record<string, Driver> = { generic_rest: genericRest };
export function getDriver(provider: string): Driver { return registry[provider] ?? genericRest; }
