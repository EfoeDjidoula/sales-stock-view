import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Détermine si l'utilisateur connecté est Super Admin LUMATEK.
 * Un administrateur client n'est jamais Super Admin.
 */
export const usePlatformAdmin = () => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["platform-admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin", {
        _user_id: user!.id,
      });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isPlatformAdmin: query.data === true,
    isLoading: query.isLoading,
  };
};
