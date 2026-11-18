import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PortalMembership { user_id: string; client_id: string; full_name: string; can_manage: boolean; active: boolean }

/** A signed-in user with a portal membership is a B2B client, never staff. */
export const usePortalMembership = () => {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["portal-membership", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("b2b_portal_users").select("user_id,client_id,full_name,can_manage,active").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as PortalMembership | null;
    },
  });
  return { membership: q.data ?? null, isLoading: !!user && q.isLoading };
};
