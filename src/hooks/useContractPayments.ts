import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ContractPayment {
  id: string;
  contract_id: string;
  tenant_id: string;
  payment_month: number;
  payment_year: number;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const errMsg = (e: unknown) => (e as { message?: string })?.message || "Erreur inconnue";

export const useContractPayments = () => {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["contract-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_payments").select("*")
        .order("payment_year", { ascending: false })
        .order("payment_month", { ascending: false });
      if (error) throw error;
      return (data || []) as ContractPayment[];
    },
  });

  const add = useMutation({
    mutationFn: async (p: Omit<ContractPayment, "id" | "created_at">) => {
      if (p.amount <= 0) throw new Error("Le montant doit être supérieur à zéro.");
      if (p.payment_month < 1 || p.payment_month > 12) throw new Error("Mois invalide.");
      const { error } = await supabase.from("contract_payments").insert(p as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-payments"] });
      toast.success("Paiement enregistré");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-payments"] });
      toast.success("Paiement supprimé");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const payments = q.data || [];
  const forContract = (contractId: string) => payments.filter((p) => p.contract_id === contractId);
  const paidFor = (contractId: string) =>
    forContract(contractId).reduce((s, p) => s + Number(p.amount), 0);
  /** Reste à payer sur le montant du contrat (jamais négatif). */
  const remainingFor = (contractId: string, contractAmount: number) =>
    Math.max(0, Number(contractAmount) - paidFor(contractId));

  return { payments, isLoading: q.isLoading, add, remove, forContract, paidFor, remainingFor };
};
