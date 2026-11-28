import { withCors } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = { "Content-Type": "application/json" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "No authorization header" }, 401);
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: platformAdmin } = await admin.from("platform_admins").select("id").eq("user_id", caller.id).maybeSingle();
    const { data: mayEdit, error: permissionError } = await admin.rpc("has_permission", { _user_id: caller.id, _permission_code: "users.edit" });
    if (permissionError || !mayEdit) return json({ error: "Droit de modification des utilisateurs requis" }, 403);

    const body = await req.json().catch(() => ({}));
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    const full_name = typeof body.full_name === "string" ? body.full_name.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    if (!user_id) return json({ error: "user_id requis" }, 400);
    if (full_name !== undefined && (full_name.length < 2 || full_name.length > 100)) return json({ error: "Le nom doit contenir entre 2 et 100 caractères" }, 400);
    if (email !== undefined && email !== "" && (!EMAIL_REGEX.test(email) || email.length > 255)) return json({ error: "Adresse email invalide" }, 400);

    const [{ data: cp }, { data: tp }] = await Promise.all([
      admin.from("profiles").select("tenant_id").eq("user_id", caller.id).maybeSingle(),
      admin.from("profiles").select("tenant_id").eq("user_id", user_id).maybeSingle(),
    ]);
    if (!tp) return json({ error: "Utilisateur introuvable" }, 404);
    if (!platformAdmin && (!cp?.tenant_id || cp.tenant_id !== tp.tenant_id)) return json({ error: "Utilisateur hors de votre périmètre" }, 403);

    if (body.action === "get") {
      const { data } = await admin.auth.admin.getUserById(user_id);
      return json({ email: data.user?.email ?? "" });
    }

    const authUpdate: Record<string, unknown> = {};
    if (email) { authUpdate.email = email; authUpdate.email_confirm = true; }
    if (full_name !== undefined) authUpdate.user_metadata = { full_name };
    if (Object.keys(authUpdate).length) {
      const { error } = await admin.auth.admin.updateUserById(user_id, authUpdate);
      if (error) return json({ error: /already/i.test(error.message) ? "Cette adresse email est déjà utilisée" : error.message }, 400);
    }
    if (full_name !== undefined) {
      const { error } = await admin.from("profiles").update({ full_name }).eq("user_id", user_id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ success: true });
  } catch (e) {
    console.error("update-user", e);
    return json({ error: "Internal server error" }, 500);
  }
};

serve(withCors(handler));
