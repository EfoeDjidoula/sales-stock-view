// Integration hub: stores encrypted connector credentials and runs idempotent sync jobs with retry/backoff.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getDriver } from "./drivers.ts";

const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key() {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Deno.env.get("INTEGRATIONS_ENC_KEY")!));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(plain));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv) };
}
async function decrypt(ciphertext: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ciphertext));
  return new TextDecoder().decode(pt);
}

// Process due jobs for one connector with the service-role client. Returns per-job results.
async function runConnectorJobs(db: SupabaseClient, conn: any) {
  const log = (level: string, message: string, details: unknown = {}, job_id?: string) =>
    db.from("integration_sync_logs").insert({ connector_id: conn.id, job_id, level, message, details });
  const now = new Date().toISOString();
  const { data: jobs } = await db.from("integration_sync_jobs").select("*").eq("connector_id", conn.id)
    .eq("status", "pending").lte("next_attempt_at", now).order("created_at").limit(10);
  let credentials: Record<string, string> = {};
  const { data: cr } = await db.from("integration_credentials").select("ciphertext,iv").eq("connector_id", conn.id).maybeSingle();
  if (cr) credentials = JSON.parse(await decrypt(cr.ciphertext, cr.iv));
  const { data: mappings } = await db.from("integration_mappings").select("entity,external_value,internal_value").eq("connector_id", conn.id);
  const driver = getDriver(conn.provider);
  const results = [];
  let failures = conn.consecutive_failures;

  for (const job of jobs ?? []) {
    // Atomic claim: only one worker can move pending -> running
    const { data: claimed } = await db.from("integration_sync_jobs").update({ status: "running", started_at: now, attempts: job.attempts + 1 })
      .eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) continue;
    const ctx = { config: conn.config ?? {}, credentials, params: job.params ?? {} };
    let r;
    try {
      const fn = job.job_type === "test" ? driver.test : job.job_type === "pull" ? driver.pull : driver.push;
      r = fn ? await fn(ctx, mappings ?? []) : { ok: false, error: "Opération non supportée par ce pilote", retryable: false };
    } catch (e) {
      r = { ok: false, error: (e as Error).message, retryable: (e as any).retryable !== false };
    }
    const attempts = job.attempts + 1;
    if (r.ok) {
      failures = 0;
      await db.from("integration_sync_jobs").update({ status: "succeeded", result: { records: r.records ?? 0, detail: r.detail ?? null }, last_error: null, finished_at: new Date().toISOString() }).eq("id", job.id);
      await log("info", `Job ${job.job_type} réussi`, { records: r.records ?? 0 }, job.id);
    } else {
      failures += 1;
      const dead = !r.retryable || attempts >= job.max_attempts;
      const delay = Math.min(3600, 30 * 2 ** (attempts - 1)); // 30s, 60s, 120s... max 1h
      await db.from("integration_sync_jobs").update({
        status: dead ? "dead" : "pending", last_error: r.error, finished_at: dead ? new Date().toISOString() : null,
        next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
      }).eq("id", job.id);
      await log("error", `Job ${job.job_type} en échec (tentative ${attempts}/${job.max_attempts})`, { error: r.error, next_retry_s: dead ? null : delay }, job.id);
    }
    results.push({ id: job.id, ok: r.ok, error: r.error });
  }

  if (results.length) {
    const lastOk = results.some((x) => x.ok);
    await db.from("integration_connectors").update({
      last_sync_at: new Date().toISOString(),
      ...(lastOk ? { last_success_at: new Date().toISOString() } : {}),
      last_error: results.at(-1)?.ok ? null : results.at(-1)?.error ?? null,
      consecutive_failures: failures,
      // Circuit breaker: 5 consecutive failures put an active connector in error
      ...(failures >= 5 && conn.status === "active" ? { status: "error" } : {}),
    }).eq("id", conn.id);
  }
  return results;
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_credentials"), connector_id: z.string().uuid(), credentials: z.record(z.string().max(4000)).refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 20) }),
  z.object({ action: z.literal("run"), connector_id: z.string().uuid() }),
  z.object({ action: z.literal("tick") }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { error: parsed.error.flatten() });
  const body = parsed.data;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Scheduled runner: invoked by the hourly database scheduler with a shared secret, no user session.
  if (body.action === "tick") {
    if (req.headers.get("x-integration-cron-secret") !== Deno.env.get("INTEGRATIONS_CRON_SECRET")) return json(401, { error: "Non autorisé" });
    const now = new Date();
    const { data: due } = await db.from("integration_connectors").select("*")
      .eq("status", "active").not("sync_interval_minutes", "is", null).lte("next_run_at", now.toISOString()).limit(25);
    const summary = [];
    for (const conn of due ?? []) {
      // Idempotent enqueue: one auto pull per connector per hour
      const hourKey = now.toISOString().slice(0, 13).replace(/[-T:]/g, "");
      const { data: job } = await db.from("integration_sync_jobs")
        .insert({ connector_id: conn.id, job_type: "pull", idempotency_key: `auto:pull:${hourKey}` })
        .select("id").maybeSingle();
      await db.from("integration_sync_logs").insert({
        connector_id: conn.id, job_id: job?.id ?? null, level: "info",
        message: job ? "Exécution planifiée déclenchée" : "Exécution planifiée déjà en file (idempotence)",
        details: { interval_minutes: conn.sync_interval_minutes },
      });
      const results = await runConnectorJobs(db, conn);
      // Next run from the scheduled time; if runs were missed, restart from now to avoid a catch-up burst
      let next = new Date(new Date(conn.next_run_at).getTime() + conn.sync_interval_minutes * 60000);
      if (next <= now) next = new Date(now.getTime() + conn.sync_interval_minutes * 60000);
      await db.from("integration_connectors").update({ next_run_at: next.toISOString() }).eq("id", conn.id);
      summary.push({ connector_id: conn.id, processed: results.length, next_run_at: next.toISOString() });
    }
    return json(200, { connectors: summary.length, summary });
  }

  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json(401, { error: "Non authentifié" });

  // Authorization uses the caller's own RLS: the connector is visible only if they may manage it.
  const { data: conn } = await userClient.from("integration_connectors").select("*").eq("id", body.connector_id).maybeSingle();
  if (!conn) return json(403, { error: "Accès refusé" });
  const log = (level: string, message: string, details: unknown = {}, job_id?: string) =>
    db.from("integration_sync_logs").insert({ connector_id: conn.id, job_id, level, message, details });

  if (body.action === "set_credentials") {
    const enc = await encrypt(JSON.stringify(body.credentials));
    const { error } = await db.from("integration_credentials").upsert({ connector_id: conn.id, ...enc, updated_by: u.user.id, updated_at: new Date().toISOString() });
    if (error) return json(500, { error: "Enregistrement impossible" });
    const first = Object.values(body.credentials)[0] ?? "";
    const hint = `${Object.keys(body.credentials).join(", ")} · ••••${first.slice(-4)}`;
    await db.from("integration_connectors").update({ has_credentials: true, credential_hint: hint, credential_updated_at: new Date().toISOString() }).eq("id", conn.id);
    await log("info", "Identifiants mis à jour", { keys: Object.keys(body.credentials), by: u.user.id });
    await db.from("audit_logs").insert({ tenant_id: conn.tenant_id, country_id: conn.country_id, user_id: u.user.id, action: "integration.set_credentials", module: "integrations", entity_type: "integration_connector", entity_id: conn.id, new_value: { keys: Object.keys(body.credentials) } }).then(() => {}, () => {});
    return json(200, { ok: true, hint });
  }

  // run: claim due jobs for this connector
  const results = await runConnectorJobs(db, conn);
  return json(200, { processed: results.length, results });
});
