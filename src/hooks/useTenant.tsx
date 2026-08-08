import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Tenant {
  id: string;
  code: string;
  slug: string;
  name: string;
  legal_name: string | null;
  trade_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  primary_color: string;
  secondary_color: string;
  default_currency: string;
  default_language: string;
  status: string;
}

const STORAGE_KEY = "lumatek.selectedTenantId";

interface TenantContextType {
  tenantId: string | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  homeTenantId: string | null;
  isLoading: boolean;
  canSwitchTenant: boolean;
  setTenantId: (id: string) => void;
  refetchTenants: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTenant = searchParams.get("tenant");
  const [override, setOverride] = useState<string | null>(
    () =>
      urlTenant ??
      (typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null)
  );

  // Un lien partagé (?tenant=) prend le pas sur la sélection locale
  useEffect(() => {
    if (urlTenant && urlTenant !== override) setOverride(urlTenant);
  }, [urlTenant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tenant rattaché au profil de l'utilisateur connecté
  const profileQuery = useQuery({
    queryKey: ["profile-tenant", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.tenant_id as string) ?? null;
    },
    enabled: !!user?.id,
  });

  // Tenants visibles (RLS : son propre tenant, tous pour les admins)
  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").order("name");
      if (error) throw error;
      return (data || []) as Tenant[];
    },
    enabled: !!user?.id,
  });

  const homeTenantId = profileQuery.data ?? null;
  const tenants = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);

  const tenantId = useMemo(() => {
    if (override && tenants.some((t) => t.id === override)) return override;
    return homeTenantId;
  }, [override, tenants, homeTenantId]);

  const tenant = useMemo(
    () => tenants.find((t) => t.id === tenantId) ?? null,
    [tenants, tenantId]
  );

  const setTenantId = (id: string) => {
    setOverride(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  // Toute bascule de tenant recharge l'ensemble des données affichées
  useEffect(() => {
    if (!tenantId) return;
    queryClient.invalidateQueries();
  }, [tenantId, queryClient]);

  const value: TenantContextType = {
    tenantId,
    tenant,
    tenants,
    homeTenantId,
    isLoading: profileQuery.isLoading || tenantsQuery.isLoading,
    canSwitchTenant: tenants.length > 1,
    setTenantId,
    refetchTenants: () => {
      tenantsQuery.refetch();
    },
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within a TenantProvider");
  return ctx;
};
