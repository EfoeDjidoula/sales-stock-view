import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";

/**
 * Pastilles du menu latéral : compteurs en lecture seule, limités par RLS
 * et filtrés sur la société + le pays actifs. Un onglet non accessible
 * n'est jamais interrogé.
 */
export const useNavBadges = (canAccessTab: (tab: string) => boolean) => {
  const { tenantId, countryId, scopeQuery } = useScope();
  const want = {
    anti_fraude: canAccessTab("anti_fraude"),
    reconciliation: canAccessTab("reconciliation"),
    workflows: canAccessTab("workflows"),
    logistique_avancee: canAccessTab("logistique_avancee"),
  };

  return useQuery({
    queryKey: ["nav-badges", tenantId, countryId, want],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const count = async (enabled: boolean, build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
        if (!enabled) return 0;
        const { count: c, error } = await build();
        return error ? 0 : c ?? 0;
      };
      const head = { count: "exact" as const, head: true };
      const [fraud, recon, wf, logi] = await Promise.all([
        count(want.anti_fraude, () =>
          scopeQuery(db.from("fraud_alerts").select("id", head)).not("workflow", "in", "(closed,false_positive)")),
        count(want.reconciliation, () =>
          scopeQuery(db.from("reconciliations").select("id", head)).eq("result", "anomalie").not("workflow", "in", "(validated,closed)")),
        count(want.workflows, () =>
          scopeQuery(db.from("workflow_requests").select("id", head)).in("status", ["submitted", "escalated"])),
        count(want.logistique_avancee, () => scopeQuery(db.from("logistics_alerts").select("kind", head))),
      ]);
      return { anti_fraude: fraud, reconciliation: recon, workflows: wf, logistique_avancee: logi } as Record<string, number>;
    },
  });
};

/** Pastilles « critiques » (affichées en rouge). */
export const CRITICAL_BADGES = new Set(["anti_fraude", "reconciliation"]);
