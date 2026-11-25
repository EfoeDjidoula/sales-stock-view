import { withCors } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Vérifie un jeton Cloudflare Turnstile côté serveur avant la connexion.
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

  // Limite : 10 requêtes / minute / adresse IP (IP hachée, compteur en base).
  const clientIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
    const bucket = "turnstile:" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed, error } = await admin.rpc("edge_rate_limit_hit", { _bucket: bucket, _limit: 10 });
    if (!error && allowed === false) return json({ success: false, error: "rate_limited" }, 429);
    if (error) console.error("rate limit", error.message);
  } catch (e) { console.error("rate limit", e); }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return json({ success: false, error: "captcha_not_configured" }, 500);

  let token = "";
  try {
    const body = await req.json();
    token = typeof body?.token === "string" ? body.token : "";
  } catch {
    return json({ success: false, error: "invalid_body" }, 400);
  }
  if (!token || token.length > 2048) return json({ success: false, error: "missing_token" }, 400);

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!data?.success) {
      return json({ success: false, error: "captcha_failed", codes: data?.["error-codes"] ?? [] }, 403);
    }
    return json({ success: true });
  } catch (e) {
    console.error("turnstile verify error", e);
    return json({ success: false, error: "captcha_unreachable" }, 502);
  }
}));
