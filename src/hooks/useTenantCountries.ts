import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface Country {
  id: string;
  name: string;
  iso_code: string;
  flag: string | null;
  default_currency: string;
  timezone: string;
  default_language: string;
  is_active: boolean;
}

export interface TenantCountry {
  id: string;
  tenant_id: string;
  country_id: string;
  currency: string | null;
  timezone: string | null;
  language: string | null;
  status: string;
  is_default: boolean;
  is_active: boolean;
  configuration: unknown;
  created_at: string;
}

export interface TenantCountryInput {
  country_id: string;
  currency: string;
  timezone: string;
  language: string;
  status: string;
  is_default: boolean;
}

export const useCountries = () =>
  useQuery({
    queryKey: ["countries-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("id, name, iso_code, flag, default_currency, timezone, default_language, is_active")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Country[];
    },
  });

export const useTenantCountries = (tenantId: string | null) => {
  const queryClient = useQueryClient();
  const key = ["tenant-countries", tenantId];

  const query = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_countries")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as TenantCountry[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const assignCountry = useMutation({
    mutationFn: async (input: TenantCountryInput) => {
      const { error } = await supabase.from("tenant_countries").insert({
        tenant_id: tenantId!,
        country_id: input.country_id,
        currency: input.currency,
        timezone: input.timezone,
        language: input.language,
        status: input.status,
        is_default: input.is_default,
        is_active: input.status === "active",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Pays affecté", description: "Le pays a été rattaché au client." });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateCountry = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<TenantCountryInput> }) => {
      const patch: Record<string, unknown> = { ...input };
      if (input.status) patch.is_active = input.status === "active";
      const { error } = await supabase.from("tenant_countries").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Pays mis à jour" });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const setDefaultCountry = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase
        .from("tenant_countries")
        .update({ is_default: false } as never)
        .eq("tenant_id", tenantId!);
      if (e1) throw e1;
      const { error } = await supabase
        .from("tenant_countries")
        .update({ is_default: true } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Pays principal mis à jour" });
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  return {
    tenantCountries: query.data ?? [],
    isLoading: query.isLoading,
    assignCountry,
    updateCountry,
    setDefaultCountry,
  };
};
