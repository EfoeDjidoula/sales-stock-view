import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LumatekActivity {
  id: string;
  label: string;
  detail: string;
  date: string;
}

export const useLumatekStats = () => {
  return useQuery({
    queryKey: ["lumatek-stats"],
    queryFn: async () => {
      const [tenantsRes, profilesRes, stationsRes, countriesRes] = await Promise.all([
        supabase.from("tenants").select("id, name, trade_name, status, created_at"),
        supabase.from("profiles").select("id, full_name, created_at, is_active"),
        supabase.from("stations").select("id"),
        supabase.from("countries").select("id, name, is_active"),
      ]);

      const tenants = tenantsRes.data || [];
      const profiles = profilesRes.data || [];
      const countries = countriesRes.data || [];

      const activity: LumatekActivity[] = [
        ...tenants.map((t) => ({
          id: `tenant-${t.id}`,
          label: "Nouveau client",
          detail: t.trade_name || t.name,
          date: t.created_at as string,
        })),
        ...profiles.map((p) => ({
          id: `profile-${p.id}`,
          label: "Nouvel utilisateur",
          detail: p.full_name || "Utilisateur sans nom",
          date: p.created_at as string,
        })),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 8);

      return {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.status === "active").length,
        suspendedTenants: tenants.filter((t) => t.status === "suspended").length,
        archivedTenants: tenants.filter((t) => t.status === "archived").length,
        totalUsers: profiles.length,
        activeUsers: profiles.filter((p) => p.is_active !== false).length,
        totalStations: (stationsRes.data || []).length,
        activeCountries: countries.filter((c) => c.is_active).length,
        activity,
      };
    },
  });
};
