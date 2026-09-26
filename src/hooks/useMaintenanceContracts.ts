import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const CONTRACT_STATUSES = ["active", "renewal_due", "expired", "suspended", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_ALERTS = [90, 60, 30, 15, 7] as const;

export interface MaintenanceContract {
  id: string;
  contract_number: string;
  tenant_id: string;
  contract_type: string;
  signature_date: string | null;
  start_date: string;
  end_date: string;
  amount: number;
  billing_frequency: string;
  sla: string | null;
  support_level: string;
  client_contact: string | null;
  lumatek_manager: string | null;
  status: ContractStatus;
  document_url: string | null;
  notes: string | null;
  previous_contract_id: string | null;
  created_at: string;
}

const DAY = 86400000;
export const daysLeft = (end: string) =>
  Math.round((new Date(end).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime()) / DAY);

/** Statut effectif selon les dates : renouvellement à prévoir à J-90, expiré après la fin. */
export const contractEffectiveStatus = (c: Pick<MaintenanceContract, "status" | "end_date">): ContractStatus => {
  if (["suspended", "terminated", "expired"].includes(c.status)) return c.status;
  const d = daysLeft(c.end_date);
  if (d < 0) return "expired";
  if (d <= 90) return "renewal_due";
  return "active";
};

/** Palier d'alerte atteint (J-90 … J-7) ou null. */
export const contractAlert = (c: Pick<MaintenanceContract, "status" | "end_date">) => {
  if (["suspended", "terminated", "expired"].includes(c.status)) return null;
  const d = daysLeft(c.end_date);
  if (d < 0) return null;
  return [...CONTRACT_ALERTS].reverse().find((t) => d <= t) ?? null;
};

const errMsg = (e: unknown) => (e as { message?: string })?.message || "Erreur inconnue";
const clean = (c: Partial<MaintenanceContract>) => {
  const { id: _i, created_at: _c, contract_number, ...rest } = c;
  return { ...rest, ...(contract_number?.trim() ? { contract_number: contract_number.trim() } : {}) };
};

export const useMaintenanceContracts = () => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["maintenance-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_contracts").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as MaintenanceContract[];
    },
  });
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["maintenance-contracts"] }); toast.success(msg); };

  const save = useMutation({
    mutationFn: async (c: Partial<MaintenanceContract>) => {
      const payload = clean(c);
      const { error } = c.id
        ? await supabase.from("maintenance_contracts").update(payload).eq("id", c.id)
        : await supabase.from("maintenance_contracts").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => done("Contrat enregistré"),
    onError: (e) => toast.error(errMsg(e)),
  });

  /** Renouvellement : l'ancien contrat est conservé (expiré) et un nouveau lui est rattaché. */
  const renew = useMutation({
    mutationFn: async (c: MaintenanceContract) => {
      const len = new Date(c.end_date).getTime() - new Date(c.start_date).getTime();
      const start = new Date(new Date(c.end_date).getTime() + DAY);
      const end = new Date(start.getTime() + len);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const next = clean({ ...c, contract_number: "", start_date: iso(start), end_date: iso(end),
        signature_date: iso(new Date()), status: "active", previous_contract_id: c.id });
      const { error } = await supabase.from("maintenance_contracts").insert(next as never);
      if (error) throw error;
      const { error: e2 } = await supabase.from("maintenance_contracts").update({ status: "expired" }).eq("id", c.id);
      if (e2) throw e2;
    },
    onSuccess: () => done("Contrat renouvelé, historique conservé"),
    onError: (e) => toast.error(errMsg(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContractStatus }) => {
      const { error } = await supabase.from("maintenance_contracts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => done("Statut mis à jour"),
    onError: (e) => toast.error(errMsg(e)),
  });

  const contracts = q.data || [];
  /** Contrat courant d'un client : le plus récent non résilié. */
  const currentFor = (tenantId: string) =>
    contracts.find((c) => c.tenant_id === tenantId && c.status !== "terminated") ??
    contracts.find((c) => c.tenant_id === tenantId) ?? null;

  return { contracts, isLoading: q.isLoading, save, renew, setStatus, currentFor };
};
