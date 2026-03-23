import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface FiscalYear {
  id: string;
  year: number;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useFiscalYears() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: fiscalYears = [], isLoading } = useQuery({
    queryKey: ["fiscal-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_years" as any)
        .select("*")
        .order("year", { ascending: false });
      if (error) throw error;
      return (data as any[]) as FiscalYear[];
    },
    enabled: !!user,
  });

  const createFiscalYear = useMutation({
    mutationFn: async (year: number) => {
      const { error } = await supabase
        .from("fiscal_years" as any)
        .insert({ year, status: "open", created_by: user!.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      toast({ title: "Exercice créé", description: "L'exercice comptable a été ouvert avec succès." });
    },
    onError: (error: any) => {
      const msg = error.message?.includes("duplicate")
        ? "Un exercice existe déjà pour cette année."
        : error.message;
      toast({ variant: "destructive", title: "Erreur", description: msg });
    },
  });

  const toggleFiscalYear = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "open" | "closed" }) => {
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === "closed") updates.closed_at = new Date().toISOString();
      else updates.closed_at = null;
      const { error } = await supabase
        .from("fiscal_years" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      toast({
        title: newStatus === "closed" ? "Exercice clôturé" : "Exercice réouvert",
        description: newStatus === "closed"
          ? "L'exercice comptable a été clôturé."
          : "L'exercice comptable a été réouvert.",
      });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Erreur", description: error.message });
    },
  });

  const deleteFiscalYear = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("fiscal_years" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      toast({ title: "Exercice supprimé" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Erreur", description: error.message });
    },
  });

  return { fiscalYears, isLoading, createFiscalYear, toggleFiscalYear, deleteFiscalYear };
}
