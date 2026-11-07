// Vérifie un jeton Cloudflare Turnstile côté serveur avant la connexion.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);

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
});
