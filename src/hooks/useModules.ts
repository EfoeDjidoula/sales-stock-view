import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCountry } from "@/hooks/useCountry";

export interface PlatformModule {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  is_core: boolean;
  position: number;
}

export const MODULE_CATEGORY_LABELS: Record<string, string> = {
  pilotage: "Pilotage",
  reseau: "Réseau",
  exploitation: "Exploitation",
  logistique: "Logistique",
  commercial: "Commercial",
  equipement: "Équipement",
  conformite: "Conformité",
  finance: "Finance",
  general: "Général",
};

/** Catalogue global des modules de la plateforme. */
export const useModuleCatalog = () =>
  useQuery({
    queryKey: ["modules-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modules")
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []) as PlatformModule[];
    },
    staleTime: 5 * 60 * 1000,
  });

/**
 * Modules effectivement actifs pour le contexte courant (société + pays).
 * Priorité : surcharge pays > réglage société > actif par défaut.
 */
export const useModules = () => {
  const { tenantId } = useTenant();
  const { countryId } = useCountry();
  const queryClient = useQueryClient();
  const catalog = useModuleCatalog();

  const flags = useQuery({
    queryKey: ["module-flags", tenantId, countryId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [tenantRes, countryRes] = await Promise.all([
        supabase
          .from("tenant_modules")
          .select("module_key, is_enabled")
          .eq("tenant_id", tenantId!),
        countryId
          ? supabase
              .from("country_modules")
              .select("module_key, is_enabled")
              .eq("tenant_id", tenantId!)
              .eq("country_id", countryId)
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      if (tenantRes.error) throw tenantRes.error;
      if (countryRes.error) throw countryRes.error;

      const map: Record<string, boolean> = {};
      for (const row of tenantRes.data || []) map[row.module_key] = row.is_enabled;
      for (const row of countryRes.data || []) map[row.module_key] = row.is_enabled;

      // Restriction par le plan de licence courant (modules cœur toujours autorisés)
      const { data: lic } = await supabase
        .from("licenses")
        .select("plan_id, status")
        .eq("tenant_id", tenantId!)
        .not("status", "in", "(terminated,draft)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lic) {
        const [{ data: planMods }, { data: allMods }] = await Promise.all([
          supabase.from("license_modules").select("module_key").eq("plan_id", lic.plan_id),
          supabase.from("modules").select("key, is_core"),
        ]);
        const allowed = new Set((planMods || []).map((m) => m.module_key));
        for (const m of allMods || []) {
          if (!m.is_core && !allowed.has(m.key)) map[m.key] = false;
        }
      }
      return map;
    },
  });

  const enabledMap = useMemo(() => flags.data ?? {}, [flags.data]);

  /** Un module inconnu ou non configuré reste actif (aucune régression). */
  const isModuleEnabled = (key: string) => enabledMap[key] !== false;

  return {
    modules: catalog.data ?? [],
    enabledMap,
    isModuleEnabled,
    isLoading: catalog.isLoading || flags.isLoading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ["module-flags"] });
    },
  };
};
