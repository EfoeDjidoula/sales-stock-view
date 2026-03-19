import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type AppRole = "admin" | "manager" | "operator";

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole | null;
  created_at: string;
  is_active: boolean;
}

export const useUserRoles = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchCurrentUserRole = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error(error);
        return;
      }

      const role = data?.role as AppRole | null;
      setCurrentUserRole(role);
      setIsAdmin(role === "admin");
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUsersWithRoles = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch profiles with their roles and is_active status
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, created_at, is_active");

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError && rolesError.code !== "PGRST116") {
        throw rolesError;
      }

      // Combine data
      const usersData: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          id: profile.user_id,
          email: "",
          full_name: profile.full_name,
          role: userRole?.role as AppRole | null,
          created_at: profile.created_at,
          is_active: profile.is_active ?? true,
        };
      });

      setUsers(usersData);
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  const assignRole = async (userId: string, role: AppRole) => {
    try {
      const { data: existing } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });

        if (error) throw error;
      }

      toast.success("Rôle attribué avec succès");
      await fetchUsersWithRoles();
      await fetchCurrentUserRole();
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de l'attribution du rôle");
    }
  };

  const removeRole = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      toast.success("Rôle retiré avec succès");
      await fetchUsersWithRoles();
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de la suppression du rôle");
    }
  };

  const toggleUserActive = async (userId: string, isActive: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke("toggle-user-status", {
        body: { user_id: userId, is_active: isActive },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(isActive ? "Compte activé" : "Compte désactivé");
      await fetchUsersWithRoles();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Erreur lors de la modification du statut");
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });

      if (error) throw error;

      toast.success("Email de réinitialisation envoyé");
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de l'envoi de l'email");
    }
  };

  useEffect(() => {
    fetchCurrentUserRole();
    fetchUsersWithRoles();
  }, [user]);

  return {
    users,
    currentUserRole,
    isAdmin,
    loading,
    assignRole,
    removeRole,
    toggleUserActive,
    sendPasswordReset,
    refetch: fetchUsersWithRoles,
  };
};
