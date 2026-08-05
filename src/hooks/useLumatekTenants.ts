import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tenant } from "@/hooks/useTenant";

export type TenantStatus = "active" | "suspended" | "archived";

export interface TenantInput {
  code: string;
  name: string;
  trade_name: string;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  default_currency?: string;
  default_language?: string;
  status?: TenantStatus;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const useLumatekTenants = () => {
  const queryClient = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ["lumatek-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as (Tenant & { created_at: string; plan: string })[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lumatek-tenants"] });
    queryClient.invalidateQueries({ queryKey: ["tenants"] });
    queryClient.invalidateQueries({ queryKey: ["lumatek-stats"] });
  };

  const createTenant = useMutation({
    mutationFn: async (input: TenantInput) => {
      const { error } = await supabase.from("tenants").insert({
        code: input.code.toUpperCase(),
        slug: slugify(input.trade_name || input.name || input.code),
        name: input.name,
        trade_name: input.trade_name,
        legal_name: input.legal_name || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        website: input.website || null,
        default_currency: input.default_currency || "XOF",
        default_language: input.default_language || "fr",
        status: input.status || "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client créé");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Erreur lors de la création"),
  });

  const updateTenant = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<TenantInput> }) => {
      const { error } = await supabase.from("tenants").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Client mis à jour");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Erreur lors de la mise à jour"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TenantStatus }) => {
      const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const labels: Record<TenantStatus, string> = {
        active: "Client activé",
        suspended: "Client suspendu",
        archived: "Client archivé",
      };
      toast.success(labels[vars.status]);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Erreur lors du changement de statut"),
  });

  return {
    tenants: tenantsQuery.data || [],
    isLoading: tenantsQuery.isLoading,
    createTenant,
    updateTenant,
    setStatus,
  };
};
