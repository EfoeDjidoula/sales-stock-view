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
  screen_label?: string | null;
  group_label?: string;
  prerequisites?: string[];
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
  fuel_cards: "Cartes carburant",
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
  synthesis: "États de synthèse & Contrôle",
  sales: "Ventes & clôtures",
  reconciliation: "Réconciliation",
  fraud: "Anti-fraude & risques",
  hse: "HSE & Conformité",
  workflows: "Workflows & approbations",
  integrations: "Intégrations Enterprise",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "Consulter",
  create: "Créer",
  edit: "Modifier",
  validate: "Valider",
  delete: "Supprimer",
  export: "Exporter",
  administer: "Administrer",
  manage: "Gérer",
  reject: "Rejeter", submit: "Soumettre", reopen: "Rouvrir", cancel: "Annuler",
  create_proforma: "Créer une pro-forma", issue_order: "Émettre un BC", set_payment_status: "Enregistrer le règlement",
  edit_order: "Modifier le BC", delete_order: "Supprimer le BC",
  sign_logistics: "Visa logistique", sign_director: "Visa directeur d’exploitation",
  sign_shipper: "Visa expéditeur", sign_driver: "Recueillir la signature chauffeur", sign_consignee: "Signer la réception",
  start_loading: "Débuter le chargement", finish_loading: "Terminer le chargement", depart: "Enregistrer le départ",
  arrive: "Enregistrer l’arrivée", start_unloading: "Débuter le déchargement", deliver: "Confirmer la livraison",
  incident: "Déclarer un incident", resume: "Reprendre le transport", position: "Enregistrer une position GPS",
  set_loads: "Affecter les compartiments", confirm_site: "Confirmer un site", rectify: "Rectifier un écart", justify: "Justifier un écart",
  generate: "Générer les BL", assign: "Désigner le destinataire", complete: "Clôturer l’intervention",
  start: "Démarrer l’action", submit_closure: "Soumettre la clôture", validate_closure: "Valider la clôture", reject_closure: "Rejeter la clôture",
  terms: "Définir les conditions contractuelles", exception: "Accorder une dérogation de crédit", consumption: "Saisir une consommation",
  invoice: "Émettre une facture", payment: "Enregistrer un paiement", account: "Créer un compte",
  vehicle: "Gérer les véhicules", driver: "Gérer les conducteurs", card: "Émettre une carte", status: "Bloquer / débloquer",
  replace: "Remplacer une carte", topup: "Recharger le compte", allocate: "Allouer un montant", return: "Restituer une allocation",
  limit: "Modifier les plafonds", restrictions: "Configurer les restrictions", purchase: "Enregistrer un achat", invoice_payment: "Encaisser une facture",
  approve: "Approuver", escalate: "Escalader", comment: "Commenter", update: "Modifier le connecteur",
  set_status: "Activer / suspendre", set_schedule: "Planifier la synchronisation", set_mapping: "Configurer les correspondances",
  delete_mapping: "Supprimer une correspondance", enqueue: "Lancer une synchronisation", retry: "Relancer un traitement",
  order: "Commander", load: "Charger", receive: "Valider la réception", analyze: "Analyser",
  request_justification: "Demander une justification", confirm: "Confirmer l’alerte", false_positive: "Classer sans suite", close: "Clore l’alerte",
};

export const ACTION_ORDER = [
  "view",
  "create",
  "edit",
  "validate",
  "delete",
  "export",
  "administer",
  "manage",
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
      const rows: { role_id: string; permission_id: string }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("role_permissions")
          .select("role_id, permission_id").order("role_id").order("permission_id")
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return rows;
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

  const saveRolePermissions = async (roleId: string, permissionIds: string[]) => {
    const { error } = await supabase.rpc("rbac_save_role_permissions", {
      _role: roleId, _permission_ids: permissionIds,
    });
    if (error) { toast.error(error.message); return false; }
    invalidate();
    toast.success("Droits du profil enregistrés");
    return true;
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
      const { data: created, error } = await supabase.rpc("rbac_role_action", {
        _action: "duplicate", _tenant: tenantId, _role: role.id,
        _name: name || `${role.name} (personnalisé)`, _description: role.description ?? undefined,
      });
      if (error) throw error;
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
      const { data, error } = await supabase.rpc("rbac_role_action", {
        _action: "create", _tenant: tenantId, _name: name, _description: description,
      });
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
    if (!tenantId) return false;
    try {
      const { error } = await supabase.rpc("rbac_role_action", {
        _action: "delete", _tenant: tenantId, _role: roleId,
      });
      if (error) throw error;
      invalidate();
      toast.success("Rôle supprimé");
      return true;
    } catch (e) {
      console.error(e);
      toast.error((e as { message?: string }).message ?? "Suppression impossible");
      return false;
    }
  };

  /** Un seul rôle actif par utilisateur et par société. */
  const setUserRole = async (userId: string, roleId: string | null) => {
    if (!tenantId) return;
    try {
      const { error } = await supabase.rpc("rbac_assign_role", { _user: userId, _role: roleId ?? undefined });
      if (error) throw error;
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["user-roles"] });
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
    saveRolePermissions,
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
