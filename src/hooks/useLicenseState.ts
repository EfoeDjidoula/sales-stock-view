import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

export type LicenseMode = "full" | "grace" | "read_only" | "limited" | "blocked";

export interface LicenseState {
  tenant_status: string;
  mode: LicenseMode;
  has_license: boolean;
  license_number: string | null;
  plan_name: string | null;
  status: string | null;
  expiration_date: string | null;
  grace_end: string | null;
  days_left: number | null;
  expiry_policy: "read_only" | "limited" | null;
  max_users: number | null; max_countries: number | null; max_stations: number | null;
  users: number; countries: number; stations: number;
}

export const ALERT_THRESHOLDS = [60, 30, 15, 7, 0] as const;

/** Palier d'alerte atteint (J-60, J-30, J-15, J-7, Jour J) ou null. */
export const alertThreshold = (daysLeft: number | null) => {
  if (daysLeft == null || daysLeft < 0) return null;
  return [...ALERT_THRESHOLDS].reverse().find((t) => daysLeft <= t) ?? null;
};

/** Moteur de contrôle : état de licence du tenant actif, recalculé côté serveur. */
export const useLicenseState = () => {
  const { tenantId } = useTenant();
  const { isPlatformAdmin } = usePlatformAdmin();
  const q = useQuery({
    queryKey: ["license-state", tenantId],
    enabled: !!tenantId,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_license_state", { _tenant_id: tenantId! });
      if (error) throw error;
      return data as unknown as LicenseState | null;
    },
  });
  const s = q.data ?? null;
  const mode: LicenseMode = isPlatformAdmin ? "full" : s?.mode ?? "full";
  return {
    state: s,
    mode,
    isReadOnly: mode === "read_only" || mode === "limited" || mode === "blocked",
    isLimited: mode === "limited",
    isBlocked: mode === "blocked",
    isLoading: q.isLoading,
  };
};
