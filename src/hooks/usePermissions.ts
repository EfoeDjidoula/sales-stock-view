import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "validate"
  | "delete"
  | "export"
  | "administer";

/**
 * Permissions effectives de l'utilisateur connecté (via ses rôles).
 * La base applique la règle de son côté : ceci ne sert qu'à adapter l'interface.
 */
export const usePermissions = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["my-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_permissions", {
        _user_id: user!.id,
      });
      if (error) throw error;
      return new Set(((data || []) as { code: string }[]).map((r) => r.code));
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const codes = query.data ?? new Set<string>();

  /** `can("clients", "create")` ou `can("clients.create")` */
  const can = (module: string, action?: PermissionAction) =>
    codes.has(action ? `${module}.${action}` : module);

  return {
    permissions: codes,
    can,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};
