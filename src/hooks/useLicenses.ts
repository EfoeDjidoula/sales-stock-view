import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const LICENSE_STATUSES = ["draft", "active", "expiring", "expired", "suspended", "terminated"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export interface LicensePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  max_users: number | null;
  max_countries: number | null;
  max_stations: number | null;
  is_system: boolean;
  is_active: boolean;
  position: number;
  modules: string[];
}

export interface License {
  id: string;
  license_number: string;
  tenant_id: string;
  plan_id: string;
  activation_date: string | null;
  start_date: string;
  expiration_date: string;
  grace_period_days: number;
  status: LicenseStatus;
  max_users: number | null;
  max_countries: number | null;
  max_stations: number | null;
  automatic_renewal: boolean;
  notes: string | null;
}

/** Statut effectif calculé selon les dates (miroir de license_effective_status côté serveur). */
export const effectiveStatus = (l: Pick<License, "status" | "expiration_date" | "grace_period_days">): LicenseStatus => {
  if (["draft", "suspended", "terminated"].includes(l.status)) return l.status;
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const exp = new Date(l.expiration_date).getTime();
  const day = 86400000;
  if (today > exp + l.grace_period_days * day) return "expired";
  if (today > exp - 30 * day) return "expiring";
  return l.status === "expired" ? "expired" : "active";
};

const errMsg = (e: unknown) => (e as { message?: string })?.message || "Erreur inconnue";

export const useLicenses = () => {
  const qc = useQueryClient();

  const plansQuery = useQuery({
    queryKey: ["license-plans"],
    queryFn: async () => {
      const [{ data: plans, error }, { data: mods, error: e2 }] = await Promise.all([
        supabase.from("license_plans").select("*").order("position"),
        supabase.from("license_modules").select("plan_id, module_key"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return (plans || []).map((p) => ({
        ...p,
        modules: (mods || []).filter((m) => m.plan_id === p.id).map((m) => m.module_key),
      })) as LicensePlan[];
    },
  });

  const licensesQuery = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as License[];
    },
  });

  const usageQuery = useQuery({
    queryKey: ["license-usage"],
    queryFn: async () => {
      const [p, c, s] = await Promise.all([
        supabase.from("profiles").select("tenant_id").eq("is_active", true),
        supabase.from("tenant_countries").select("tenant_id").eq("is_active", true),
        supabase.from("stations").select("tenant_id"),
      ]);
      const count = (rows: { tenant_id: string | null }[] | null) =>
        (rows || []).reduce<Record<string, number>>((acc, r) => {
          if (r.tenant_id) acc[r.tenant_id] = (acc[r.tenant_id] || 0) + 1;
          return acc;
        }, {});
      return { users: count(p.data), countries: count(c.data), stations: count(s.data) };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["license-plans"] });
    qc.invalidateQueries({ queryKey: ["licenses"] });
    qc.invalidateQueries({ queryKey: ["module-flags"] });
  };

  const savePlan = useMutation({
    mutationFn: async ({ id, modules, ...input }: Partial<LicensePlan> & { modules: string[] }) => {
      const payload = {
        code: input.code!.toUpperCase().trim(),
        name: input.name!.trim(),
        description: input.description || null,
        max_users: input.max_users ?? null,
        max_countries: input.max_countries ?? null,
        max_stations: input.max_stations ?? null,
        is_active: input.is_active ?? true,
        position: input.position ?? 99,
      };
      let planId = id;
      if (id) {
        const { error } = await supabase.from("license_plans").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("license_plans").insert(payload).select("id").single();
        if (error) throw error;
        planId = data.id;
      }
      const { error: dErr } = await supabase.from("license_modules").delete().eq("plan_id", planId!);
      if (dErr) throw dErr;
      if (modules.length) {
        const { error: iErr } = await supabase
          .from("license_modules")
          .insert(modules.map((module_key) => ({ plan_id: planId!, module_key })));
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Plan enregistré"); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("license_plans").delete().eq("id", id);
      if (error) {
        if (error.code === "23503") throw new Error("Ce plan est utilisé par une licence : impossible de le supprimer.");
        throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Plan supprimé"); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const saveLicense = useMutation({
    mutationFn: async ({ id, ...input }: Partial<License>) => {
      const payload = {
        tenant_id: input.tenant_id!,
        plan_id: input.plan_id!,
        license_number: input.license_number?.trim() || "",
        start_date: input.start_date!,
        expiration_date: input.expiration_date!,
        activation_date: input.activation_date || null,
        grace_period_days: input.grace_period_days ?? 15,
        status: input.status ?? "draft",
        max_users: input.max_users ?? null,
        max_countries: input.max_countries ?? null,
        max_stations: input.max_stations ?? null,
        automatic_renewal: input.automatic_renewal ?? false,
        notes: input.notes || null,
      };
      const { error } = id
        ? await supabase.from("licenses").update(payload).eq("id", id)
        : await supabase.from("licenses").insert(payload);
      if (error) {
        if (error.code === "23505") throw new Error("Ce client a déjà une licence en cours (ou ce numéro existe déjà).");
        throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Licence enregistrée"); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return {
    plans: plansQuery.data || [],
    licenses: licensesQuery.data || [],
    usage: usageQuery.data || { users: {}, countries: {}, stations: {} },
    isLoading: plansQuery.isLoading || licensesQuery.isLoading,
    savePlan,
    deletePlan,
    saveLicense,
  };
};
