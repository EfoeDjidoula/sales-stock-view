// Dispatches pending webhook deliveries with HMAC-SHA256 signatures. Platform admins only.
// Header: X-Lumatek-Signature: t=<unix>,v1=<hex hmac of "<t>.<body>">
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json(401, { error: "Non authentifié" });
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isAdmin } = await db.rpc("is_platform_admin", { _user_id: u.user.id });
  if (!isAdmin) return json(403, { error: "Accès refusé" });

  const { data: pending } = await db.from("webhook_deliveries").select("*, webhook_endpoints(url,secret,status)")
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(50);
  let ok = 0, ko = 0;
  for (const d of pending ?? []) {
    const ep = d.webhook_endpoints as { url: string; secret: string; status: string } | null;
    const attempts = d.attempts + 1;
    if (!ep || ep.status !== "active") {
      await db.from("webhook_deliveries").update({ status: "failed", attempts, last_error: "Endpoint désactivé" }).eq("id", d.id); ko++; continue;
    }
    const body = JSON.stringify({ id: d.id, ...d.payload });
    const t = Math.floor(Date.now() / 1000);
    let code: number | null = null, err: string | null = null;
    try {
      const r = await fetch(ep.url, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", "X-Lumatek-Event": d.event, "X-Lumatek-Delivery": d.id, "X-Lumatek-Signature": `t=${t},v1=${await hmac(ep.secret, `${t}.${body}`)}` },
        body,
      });
      code = r.status; await r.body?.cancel();
      if (!r.ok) err = `HTTP ${r.status}`;
    } catch (e) { err = String((e as Error).message).slice(0, 300); }
    if (!err) {
      await db.from("webhook_deliveries").update({ status: "delivered", attempts, response_code: code, delivered_at: new Date().toISOString(), last_error: null }).eq("id", d.id); ok++;
    } else {
      const final = attempts >= 6;
      await db.from("webhook_deliveries").update({
        status: final ? "failed" : "pending", attempts, response_code: code, last_error: err,
        next_attempt_at: new Date(Date.now() + 60_000 * 2 ** attempts).toISOString(),
      }).eq("id", d.id); ko++;
    }
  }
  return json(200, { processed: (pending ?? []).length, delivered: ok, failed: ko });
});
