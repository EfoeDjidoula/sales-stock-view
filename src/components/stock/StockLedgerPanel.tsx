import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Badge } from "@/components/ui/badge";
import { MOVEMENT_LABEL } from "./StockEngineModule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: unknown) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }));
const OUT = ["exit", "sale", "transfer_out", "adjustment_out"];

/** Read-only view of the stock ledger (stations & depots): balances + dated movements. */
export const StockLedgerPanel = ({ stationId }: { stationId?: string | null }) => {
  const { scopeQuery, tenantId, countryId } = useScope();
  const { data } = useQuery({
    queryKey: ["stock-ledger-panel", tenantId, countryId, stationId],
    enabled: !!tenantId,
    queryFn: async () => {
      let lv = scopeQuery(db.from("stock_levels").select("*"));
      let mv = scopeQuery(db.from("stock_movements").select("*")).order("movement_date", { ascending: false }).limit(30);
      if (stationId) { lv = lv.eq("station_id", stationId); mv = mv.eq("station_id", stationId); }
      const [l, m, s, d, t, p] = await Promise.all([lv, mv,
        scopeQuery(db.from("stations").select("id,name")), scopeQuery(db.from("depots").select("id,name")),
        scopeQuery(db.from("tanks").select("id,name")), scopeQuery(db.from("petroleum_products").select("id,name"))]);
      const names: Record<string, string> = {};
      for (const r of [...(s.data || []), ...(d.data || []), ...(t.data || []), ...(p.data || [])]) names[r.id] = r.name;
      return { levels: (l.data || []) as Row[], moves: (m.data || []) as Row[], names };
    },
  });
  if (!data) return null;
  const n = (id?: string) => (id && data.names[id]) || "—";
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-display font-semibold">Stock du registre (stations et dépôts)</h3>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground"><tr>{["Emplacement", "Cuve", "Produit", "Entrées", "Sorties / ventes", "Stock théorique"].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {data.levels.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-2">{n(r.station_id || r.depot_id)} <span className="text-xs text-muted-foreground">({r.location_type === "station" ? "Station" : "Dépôt"})</span></td>
                <td className="p-2">{n(r.tank_id)}</td><td className="p-2">{n(r.product_id)}</td>
                <td className="p-2">{fmt(Number(r.initial_qty) + Number(r.entries))}</td><td className="p-2">{fmt(Number(r.exits) + Number(r.sales))}</td>
                <td className="p-2 font-semibold">{fmt(r.theoretical)} L</td>
              </tr>
            ))}
            {data.levels.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Aucun mouvement validé</td></tr>}
          </tbody>
        </table>
      </div>
      <h4 className="text-sm font-medium text-primary uppercase tracking-wider">Derniers mouvements (par date de saisie choisie)</h4>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground"><tr>{["Date", "Type", "Emplacement", "Produit", "Quantité", "Statut"].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {data.moves.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleDateString("fr-FR")}</td>
                <td className="p-2">{MOVEMENT_LABEL[r.movement_type] ?? r.movement_type}</td>
                <td className="p-2">{n(r.station_id || r.depot_id)}{r.tank_id ? ` · ${n(r.tank_id)}` : ""}</td>
                <td className="p-2">{n(r.product_id)}</td>
                <td className={`p-2 whitespace-nowrap ${OUT.includes(r.movement_type) ? "text-destructive" : "text-success"}`}>{r.movement_type === "inventory" ? `mesuré ${fmt(r.physical_level)}` : `${OUT.includes(r.movement_type) ? "−" : "+"}${fmt(r.quantity)} L`}</td>
                <td className="p-2"><Badge variant={r.status === "rejected" ? "destructive" : r.status === "pending" ? "outline" : "default"}>{r.status === "validated" ? "Validé" : r.status === "pending" ? "En attente" : "Rejeté"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Seuls les mouvements validés comptent dans le stock théorique. Les jauges ci-dessus viennent des saisies d'index.</p>
    </div>
  );
};
