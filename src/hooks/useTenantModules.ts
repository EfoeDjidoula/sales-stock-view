import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface TenantModuleRow {
  id: string;
  tenant_id: string;
  module_key: string;
  is_enabled: boolean;
}

export interface CountryModuleRow {
  id: string;
  tenant_id: string;
  country_id: string;
  module_key: string;
  is_enabled: boolean;
}

/** Administration LUMATEK : activation des modules d'un client et surcharges pays. */
export const useTenantModules = (tenantId: string | null) => {
  const queryClient = useQueryClient();

  const tenantModules = useQuery({
    queryKey: ["admin-tenant-modules", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_modules")
        .select("id, tenant_id, module_key, is_enabled")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data || []) as TenantModuleRow[];
    },
  });

  const countryModules = useQuery({
    queryKey: ["admin-country-modules", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("country_modules")
        .select("id, tenant_id, country_id, module_key, is_enabled")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data || []) as CountryModuleRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-tenant-modules", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["admin-country-modules", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["module-flags"] });
    queryClient.invalidateQueries({ queryKey: ["lumatek-modules"] });
  };

  const setTenantModule = useMutation({
    mutationFn: async ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => {
      if (!tenantId) throw new Error("Client non défini");
      const existing = (tenantModules.data || []).find((m) => m.module_key === moduleKey);
      if (existing) {
        const { error } = await supabase
          .from("tenant_modules")
          .update({ is_enabled: enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_modules")
          .insert({ tenant_id: tenantId, module_key: moduleKey, is_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Module mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCountryModule = useMutation({
    mutationFn: async ({
      countryId,
      moduleKey,
      enabled,
    }: {
      countryId: string;
      moduleKey: string;
      enabled: boolean | null;
    }) => {
      if (!tenantId) throw new Error("Client non défini");
      const existing = (countryModules.data || []).find(
        (m) => m.module_key === moduleKey && m.country_id === countryId
      );
      if (enabled === null) {
        if (!existing) return;
        const { error } = await supabase.from("country_modules").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("country_modules")
          .update({ is_enabled: enabled })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("country_modules")
          .insert({ tenant_id: tenantId, country_id: countryId, module_key: moduleKey, is_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success("Surcharge pays mise à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    tenantModules: tenantModules.data || [],
    countryModules: countryModules.data || [],
    isLoading: tenantModules.isLoading || countryModules.isLoading,
    setTenantModule,
    setCountryModule,
  };
};
