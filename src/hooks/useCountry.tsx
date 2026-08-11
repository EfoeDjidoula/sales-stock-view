import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";

export interface WorkspaceCountry {
  id: string;
  name: string;
  iso_code: string;
  flag: string | null;
  default_currency: string;
  default_language: string;
  timezone: string;
  is_default: boolean;
}

const storageKey = (tenantId: string) => `lumatek.selectedCountryId.${tenantId}`;

interface CountryContextType {
  countryId: string | null;
  country: WorkspaceCountry | null;
  countries: WorkspaceCountry[];
  isLoading: boolean;
  /** L'utilisateur doit choisir son espace de travail (plusieurs pays autorisés). */
  needsSelection: boolean;
  setCountryId: (id: string) => void;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

export const CountryProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { tenantId, isLoading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCountry = searchParams.get("country");
  const [selected, setSelected] = useState<string | null>(urlCountry);

  // Pays autorisés = pays affectés au client, restreints aux droits explicites de l'utilisateur
  const query = useQuery({
    queryKey: ["workspace-countries", tenantId, user?.id],
    enabled: !!user?.id && !!tenantId,
    queryFn: async () => {
      const [{ data: tc, error: e1 }, { data: access, error: e2 }] = await Promise.all([
        supabase
          .from("tenant_countries")
          .select("country_id, is_default, is_active, status, countries(id, name, iso_code, flag, default_currency, default_language, timezone)")
          .eq("tenant_id", tenantId!)
          .eq("is_active", true),
        supabase
          .from("user_country_access")
          .select("country_id")
          .eq("tenant_id", tenantId!)
          .eq("user_id", user!.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const allowedIds = new Set((access || []).map((a) => a.country_id as string));

      const list = (tc || [])
        .filter((row) => allowedIds.size === 0 || allowedIds.has(row.country_id as string))
        .map((row) => {
          const c = row.countries as unknown as Omit<WorkspaceCountry, "is_default">;
          return c ? ({ ...c, is_default: Boolean(row.is_default) } as WorkspaceCountry) : null;
        })
        .filter(Boolean) as WorkspaceCountry[];

      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const countries = useMemo(() => query.data ?? [], [query.data]);

  // Restaure la sélection : priorité au lien partagé (?country=), sinon dernière session
  useEffect(() => {
    if (!tenantId) {
      setSelected(urlCountry);
      return;
    }
    const stored = window.localStorage.getItem(storageKey(tenantId));
    setSelected(urlCountry ?? stored);
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un lien partagé change le pays actif
  useEffect(() => {
    if (urlCountry && urlCountry !== selected) setSelected(urlCountry);
  }, [urlCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un seul pays autorisé => sélection automatique (accès direct au dashboard)
  useEffect(() => {
    if (!tenantId || countries.length === 0) return;
    if (selected && countries.some((c) => c.id === selected)) return;
    if (countries.length === 1) {
      setSelected(countries[0].id);
      window.localStorage.setItem(storageKey(tenantId), countries[0].id);
    } else if (selected) {
      // Sélection stockée/URL devenue non autorisée
      setSelected(null);
      window.localStorage.removeItem(storageKey(tenantId));
    }
  }, [countries, selected, tenantId]);

  const countryId = useMemo(
    () => (selected && countries.some((c) => c.id === selected) ? selected : null),
    [selected, countries]
  );

  const country = useMemo(
    () => countries.find((c) => c.id === countryId) ?? null,
    [countries, countryId]
  );

  const setCountryId = (id: string) => {
    if (!tenantId) return;
    if (!countries.some((c) => c.id === id)) return; // pays non affecté : interdit
    window.localStorage.setItem(storageKey(tenantId), id);
    setSelected(id);
  };

  // Synchronise l'URL avec le pays actif (refresh / partage de lien)
  useEffect(() => {
    if (query.isLoading) return;
    const current = searchParams.get("country");
    if (countryId) {
      if (current === countryId) return;
      const next = new URLSearchParams(searchParams);
      next.set("country", countryId);
      setSearchParams(next, { replace: true });
    } else if (current) {
      const next = new URLSearchParams(searchParams);
      next.delete("country");
      setSearchParams(next, { replace: true });
    }
  }, [countryId, query.isLoading, searchParams, setSearchParams]);

  // Changement de pays : purge des données affichées (jamais les caches de contexte)
  const previousCountryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!countryId) return;
    const previous = previousCountryRef.current;
    previousCountryRef.current = countryId;
    if (!previous || previous === countryId) return; // 1re sélection : rien à purger
    const contextKeys = new Set(["workspace-countries", "tenants", "profile-tenant"]);
    queryClient.removeQueries({
      predicate: (q) => !contextKeys.has(q.queryKey[0] as string),
    });
    queryClient.invalidateQueries({
      predicate: (q) => !contextKeys.has(q.queryKey[0] as string),
    });
  }, [countryId, queryClient]);

  const value: CountryContextType = {
    countryId,
    country,
    countries,
    isLoading: tenantLoading || (!!tenantId && query.isLoading),
    needsSelection: !!tenantId && !query.isLoading && countries.length > 1 && !countryId,
    setCountryId,
  };


  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
};

export const useCountry = () => {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry must be used within a CountryProvider");
  return ctx;
};
