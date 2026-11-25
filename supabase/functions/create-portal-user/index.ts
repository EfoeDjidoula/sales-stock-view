// Creates a B2B client-portal login. Authorization is checked in the database
// (b2b_portal_staff_guard: clients.edit + tenant/country scope + module + licence),
// called with the caller's own token before any account is created.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentification requise" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const clientId = String(body.client_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const canManage = body.can_manage === true;

  if (!UUID.test(clientId)) return json({ error: "Client invalide" }, 400);
  if (!EMAIL.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
  if (password.length < 10 || password.length > 72) return json({ error: "Le mot de passe doit contenir entre 10 et 72 caractères" }, 400);
  if (fullName.length < 2 || fullName.length > 120) return json({ error: "Nom complet obligatoire (120 caractères max.)" }, 400);

  // 1. Authorization as the caller (RLS / permission checks apply).
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser(authHeader.slice(7));
  if (whoErr || !who.user) return json({ error: "Session invalide" }, 401);
  const { data: client, error: guardErr } = await asCaller.rpc("b2b_portal_staff_guard", { _client: clientId });
  if (guardErr || !client) return json({ error: guardErr?.message ?? "Non autorisé" }, 403);
  const c = client as { id: string; tenant_id: string; country_id: string; name: string };

  // 2. Account creation with the service role.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName, portal_client: c.id },
  });
  if (createErr || !created.user) {
    const msg = /already|registered|exists/i.test(createErr?.message ?? "") ? "Cette adresse e-mail a déjà un compte" : (createErr?.message ?? "Création impossible");
    return json({ error: msg }, 400);
  }
  const uid = created.user.id;

  // Membership first: from this row on the account has no tenant-wide access.
  const { error: memberErr } = await admin.from("b2b_portal_users").insert({
    user_id: uid, tenant_id: c.tenant_id, country_id: c.country_id, client_id: c.id,
    full_name: fullName, email, can_manage: canManage, created_by: who.user.id,
  });
  if (memberErr) {
    await admin.auth.admin.deleteUser(uid);
    return json({ error: "Création impossible : " + memberErr.message }, 500);
  }
  await admin.from("profiles").update({ tenant_id: c.tenant_id, country_id: c.country_id, full_name: fullName }).eq("user_id", uid);
  await asCaller.rpc("audit_business_event", {
    _action: "portal_user_create", _module: "clients_b2b", _entity_type: "b2b_client", _entity_id: c.id,
    _country_id: c.country_id, _details: { user_id: uid, email, can_manage: canManage }, _device: null,
  });

  return json({ user_id: uid });
});
