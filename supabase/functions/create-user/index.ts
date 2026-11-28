import { withCors } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "manager" | "operator";
  /** Pays dans lesquels le nouvel utilisateur peut intervenir (au moins un). */
  country_ids?: string[];
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authorization header to verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify the caller has admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token);
    
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: mayCreate, error: permissionError } = await supabaseAdmin.rpc("has_permission", {
      _user_id: caller.id, _permission_code: "users.create",
    });
    if (permissionError || !mayCreate) {
      return new Response(
        JSON.stringify({ error: "Droit de création des utilisateurs requis" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { email, password, full_name, role: requestedRole, country_ids, rbac_role_id }: CreateUserRequest & { rbac_role_id?: string } = await req.json();

    // Validate required fields
    if (!email || !password || !full_name || !requestedRole) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate password strength
    if (password.length < 10 || password.length > 72) {
      return new Response(
        JSON.stringify({ error: "Le mot de passe doit contenir entre 10 et 72 caractères" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate role
    const VALID_ROLES = ["admin", "manager", "operator"];
    if (!VALID_ROLES.includes(requestedRole)) {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate full_name length
    if (full_name.length > 100) {
      return new Response(
        JSON.stringify({ error: "Name must be less than 100 characters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Société de l'administrateur appelant + pays demandés (validés AVANT la création du compte)
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, country_id")
      .eq("user_id", caller.id)
      .maybeSingle();

    const requested = Array.from(new Set((Array.isArray(country_ids) ? country_ids : []).filter((v) => typeof v === "string")));
    let allowedCountries: string[] = [];
    if (callerProfile?.tenant_id) {
      if (requested.length === 0) {
        return new Response(
          JSON.stringify({ error: "Choisissez au moins un pays d'intervention" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const [{ data: tenantCountries }, { data: callerAccess }] = await Promise.all([
        supabaseAdmin.from("tenant_countries").select("country_id")
          .eq("tenant_id", callerProfile.tenant_id).eq("is_active", true),
        supabaseAdmin.from("user_country_access").select("country_id")
          .eq("tenant_id", callerProfile.tenant_id).eq("user_id", caller.id),
      ]);
      const tenantSet = new Set((tenantCountries || []).map((r) => r.country_id as string));
      const callerSet = new Set((callerAccess || []).map((r) => r.country_id as string));
      const invalid = requested.filter((id) => !tenantSet.has(id) || (callerSet.size > 0 && !callerSet.has(id)));
      if (invalid.length > 0) {
        return new Response(
          JSON.stringify({ error: "Pays non autorisé pour cette société ou pour votre compte" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      allowedCountries = requested;
    }

    if (!callerProfile?.tenant_id) return new Response(JSON.stringify({ error: "Société requise" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    const roleQuery = supabaseAdmin.from("roles").select("id,tenant_id");
    const { data: selectedRole, error: selectedRoleError } = rbac_role_id
      ? await roleQuery.eq("id", rbac_role_id).maybeSingle()
      : await roleQuery.eq("code", { admin: "client_admin", manager: "ops_manager", operator: "operator" }[requestedRole]).is("tenant_id", null).maybeSingle();
    if (selectedRoleError || !selectedRole || (selectedRole.tenant_id !== null && selectedRole.tenant_id !== callerProfile.tenant_id)) {
      return new Response(JSON.stringify({ error: "Profil métier non autorisé" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    const { data: mayAdminister } = await supabaseAdmin.rpc("has_permission", { _user_id: caller.id, _permission_code: "users.administer" });
    if (!mayAdminister) {
      const [{ data: own, error: ownError }, { data: target, error: targetError }] = await Promise.all([
        supabaseAdmin.rpc("get_user_permissions", { _user_id: caller.id }),
        supabaseAdmin.from("role_permissions").select("permissions(code)").eq("role_id", selectedRole.id),
      ]);
      const ownCodes = new Set((own ?? []).map((p: { code: string }) => p.code));
      if (ownError || targetError || (target ?? []).some((p: { permissions: { code: string } | null }) => !p.permissions || !ownCodes.has(p.permissions.code))) {
        return new Response(JSON.stringify({ error: "Vous ne pouvez pas attribuer des droits supérieurs aux vôtres" }), { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    const { data: role, error: legacyError } = await supabaseAdmin.rpc("rbac_legacy_role", { _role: selectedRole.id });
    if (legacyError || !role) return new Response(JSON.stringify({ error: "Profil métier invalide" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });

    // Create user using admin API (doesn't affect current session)
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rattache le nouvel utilisateur à la société de l'administrateur et aux pays choisis
    if (userData.user && callerProfile?.tenant_id) {
      const createdUserId = userData.user.id;
      const { error: profileScopeError } = await supabaseAdmin
        .from("profiles")
        .update({
          tenant_id: callerProfile.tenant_id,
          country_id: allowedCountries[0] ?? callerProfile.country_id ?? null,
        })
        .eq("user_id", userData.user.id);
      if (profileScopeError) {
        console.error("Error scoping new user profile:", profileScopeError);
      }
      const { error: accessError } = await supabaseAdmin.from("user_country_access").insert(
        allowedCountries.map((country_id) => ({
          user_id: createdUserId,
          tenant_id: callerProfile.tenant_id,
          country_id,
        }))
      );
      if (accessError) {
        console.error("Error granting country access:", accessError);
        // Sans pays enregistré, le compte verrait tous les pays : on le supprime plutôt.
        await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
        return new Response(
          JSON.stringify({ error: "Impossible d'enregistrer les pays d'intervention ; compte non créé" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (userData.user) {
      // Assign role to the new user
      const { error: roleInsertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userData.user.id, role });

      if (roleInsertError) {
        console.error("Error assigning role:", roleInsertError);
      }

      const { error: rbacError } = await supabaseAdmin.from("user_role_assignments").insert({
        user_id: userData.user.id, tenant_id: callerProfile.tenant_id, role_id: selectedRole.id,
      });
      if (rbacError || roleInsertError) {
        await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
        return new Response(JSON.stringify({ error: "Profil non enregistré ; compte non créé" }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: userData.user?.id, 
          email: userData.user?.email 
        } 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in create-user function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(withCors(handler));
