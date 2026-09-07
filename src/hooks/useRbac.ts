import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export interface RbacRole {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  position: number;
}

export interface RbacPermission {
  id: string;
  code: string;
  module: string;
  action: string;
  label: string;
}

export interface RbacAssignment {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id: string;
}

export interface RbacCountryAccess {
  id: string;
  user_id: string;
  tenant_id: string;
  country_id: string;
}

export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  index_entries: "Saisie des index",
  stock: "Stock",
  depotages: "Dépotages",
  orders: "Commandes",
  supplies: "Approvisionnements",
  clients: "Clients",
  suppliers: "Fournisseurs",
  trucks: "Camions",
  stations: "Stations, cuves et pompes",
  perequation: "Péréquation",
  price_structures: "Structure de prix",
  proforma: "Proforma",
  fiscal_years: "Exercice comptable",
  users: "Utilisateurs et rôles",
  settings: "Paramètres société",
  reports: "Rapports et exports",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "Consulter",
  create: "Créer",
  edit: "Modifier",
  validate: "Valider",
  delete: "Supprimer",
  export: "Exporter",
  administer: "Administrer",
};

export const ACTION_ORDER = [
  "view",
  "create",
  "edit",
  "validate",
  "delete",
  "export",
  "administer",
];

export const useRbac = () => {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ["rbac-roles", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("*")
        .order("position")
        .order("name");
      if (error) throw error;
      return (data || []) as RbacRole[];
    },
    enabled: !!user?.id,
  });

  const permissionsQuery = useQuery({
    queryKey: ["rbac-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions")
        .select("*")
        .order("module")
        .order("action");
      if (error) throw error;
      return (data || []) as RbacPermission[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  const rolePermissionsQuery = useQuery({
    queryKey: ["rbac-role-permissions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_id, permission_id");
      if (error) throw error;
      return (data || []) as { role_id: string; permission_id: string }[];
    },
    enabled: !!user?.id,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["rbac-assignments", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_role_assignments")
        .select("*");
      if (error) throw error;
      return (data || []) as RbacAssignment[];
    },
    enabled: !!user?.id,
  });

  const countryAccessQuery = useQuery({
    queryKey: ["rbac-country-access", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_country_access").select("*");
      if (error) throw error;
      return (data || []) as RbacCountryAccess[];
    },
    enabled: !!user?.id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["rbac-roles"] });
    queryClient.invalidateQueries({ queryKey: ["rbac-role-permissions"] });
    queryClient.invalidateQueries({ queryKey: ["rbac-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["rbac-country-access"] });
    queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
  };

  /** Active / désactive une permission sur un rôle de la société. */
  const toggleRolePermission = async (
    roleId: string,
    permissionId: string,
    enabled: boolean
  ) => {
    try {
      if (enabled) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: roleId, permission_id: permissionId });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId)
          .eq("permission_id", permissionId);
        if (error) throw error;
      }
      invalidate();
    } catch (e) {
      console.error(e);
      toast.error("Modification impossible", {
        description: "Vous ne pouvez modifier que les rôles de votre société.",
      });
    }
  };

  /** Copie un rôle fourni d'origine dans la société pour pouvoir l'adapter. */
  const duplicateRole = async (role: RbacRole, name?: string) => {
    if (!tenantId) return null;
    try {
      const { data: created, error } = await supabase
        .from("roles")
        .insert({
          tenant_id: tenantId,
          code: `${role.code}_${Date.now().toString(36)}`,
          name: name || `${role.name} (personnalisé)`,
          description: role.description,
          is_system: false,
          position: role.position,
        })
        .select()
        .single();
      if (error) throw error;

      const source = (rolePermissionsQuery.data || []).filter(
        (rp) => rp.role_id === role.id
      );
      if (source.length) {
        const { error: rpError } = await supabase.from("role_permissions").insert(
          source.map((rp) => ({ role_id: created.id, permission_id: rp.permission_id }))
        );
        if (rpError) throw rpError;
      }
      invalidate();
      toast.success("Rôle dupliqué : vous pouvez maintenant l'adapter");
      return created as RbacRole;
    } catch (e) {
      console.error(e);
      toast.error("Impossible de dupliquer ce rôle");
      return null;
    }
  };

  const createRole = async (name: string, description?: string) => {
    if (!tenantId) return null;
    try {
      const { data, error } = await supabase
        .from("roles")
        .insert({
          tenant_id: tenantId,
          code: `custom_${Date.now().toString(36)}`,
          name,
          description: description || null,
          is_system: false,
          position: 99,
        })
        .select()
        .single();
      if (error) throw error;
      invalidate();
      toast.success("Rôle créé");
      return data as RbacRole;
    } catch (e) {
      console.error(e);
      toast.error("Création du rôle impossible");
      return null;
    }
  };

  const deleteRole = async (roleId: string) => {
    try {
      const { error } = await supabase.from("roles").delete().eq("id", roleId);
      if (error) throw error;
      invalidate();
      toast.success("Rôle supprimé");
    } catch (e) {
      console.error(e);
      toast.error("Suppression impossible");
    }
  };

  /** Un seul rôle actif par utilisateur et par société. */
  const setUserRole = async (userId: string, roleId: string | null) => {
    if (!tenantId) return;
    try {
      const { error: delError } = await supabase
        .from("user_role_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenantId);
      if (delError) throw delError;

      if (roleId) {
        const { error } = await supabase
          .from("user_role_assignments")
          .insert({ user_id: userId, tenant_id: tenantId, role_id: roleId });
        if (error) throw error;
      }
      invalidate();
    } catch (e) {
      console.error(e);
      toast.error("Attribution du rôle impossible");
      throw e;
    }
  };

  const setUserCountries = async (userId: string, countryIds: string[]) => {
    if (!tenantId) return;
    try {
      const { error: delError } = await supabase
        .from("user_country_access")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenantId);
      if (delError) throw delError;

      if (countryIds.length) {
        const { error } = await supabase.from("user_country_access").insert(
          countryIds.map((country_id) => ({
            user_id: userId,
            tenant_id: tenantId,
            country_id,
          }))
        );
        if (error) throw error;
      }
      invalidate();
    } catch (e) {
      console.error(e);
      toast.error("Enregistrement des pays autorisés impossible");
      throw e;
    }
  };

  const setUserStations = async (userId: string, stationIds: string[]) => {
    try {
      const { error: delError } = await supabase
        .from("station_assignments")
        .delete()
        .eq("user_id", userId);
      if (delError) throw delError;

      if (stationIds.length) {
        const { error } = await supabase.from("station_assignments").insert(
          stationIds.map((station_id) => ({ user_id: userId, station_id }))
        );
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["station-assignments"] });
    } catch (e) {
      console.error(e);
      toast.error("Enregistrement des stations autorisées impossible");
      throw e;
    }
  };

  const rolePermissionSet = new Set(
    (rolePermissionsQuery.data || []).map((rp) => `${rp.role_id}:${rp.permission_id}`)
  );

  return {
    roles: rolesQuery.data || [],
    permissions: permissionsQuery.data || [],
    rolePermissionSet,
    assignments: assignmentsQuery.data || [],
    countryAccess: countryAccessQuery.data || [],
    isLoading:
      rolesQuery.isLoading ||
      permissionsQuery.isLoading ||
      rolePermissionsQuery.isLoading,
    toggleRolePermission,
    duplicateRole,
    createRole,
    deleteRole,
    setUserRole,
    setUserCountries,
    setUserStations,
    getUserRoleId: (userId: string) =>
      (assignmentsQuery.data || []).find((a) => a.user_id === userId)?.role_id ?? null,
    getUserCountryIds: (userId: string) =>
      (countryAccessQuery.data || [])
        .filter((c) => c.user_id === userId)
        .map((c) => c.country_id),
    refetch: invalidate,
  };
};
