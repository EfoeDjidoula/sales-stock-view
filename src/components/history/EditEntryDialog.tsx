import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { IndexEntry } from "@/hooks/useIndexEntries";
import { Save, Loader2 } from "lucide-react";
import { sortNozzles } from "@/lib/nozzleOrder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type PumpRow = { id: string; name: string; product_type: string; index_depart: number; index_arrivee: number; retour_cuve: number };
type TankRow = { id: string; name: string; product_type: string; jauge: number | null };

const MONEY_FIELDS = [
  ["autoconso_montant", "Autoconsommation (FCFA)"],
  ["bons_clients_montant", "Bons clients (FCFA)"],
  ["tickets_valeur_montant", "Tickets valeur (FCFA)"],
  ["cartes_montant", "Ventes par carte (FCFA)"],
  ["versement_momo", "Mobile Money (FCFA)"],
  ["versement_banque", "Versement banque (FCFA)"],
] as const;

interface Props { entry: IndexEntry | null; open: boolean; onOpenChange: (open: boolean) => void }

/** Modification d'une saisie : tous les pistolets et cuves configurés de la station, sans limite de nombre. */
export const EditEntryDialog = ({ entry, open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pumps, setPumps] = useState<PumpRow[] | null>(null);
  const [tanks, setTanks] = useState<TankRow[]>([]);
  const [money, setMoney] = useState<Record<string, number>>({});
  const [bv, setBv] = useState("");

  useEffect(() => {
    if (!open || !entry) return;
    setPumps(null);
    const e = entry as unknown as Record<string, unknown>;
    setMoney(Object.fromEntries(MONEY_FIELDS.map(([k]) => [k, Number(e[k]) || 0])));
    setBv(entry.versement_banque_ref || "");
    (async () => {
      const [p, t] = await Promise.all([
        db.from("pump_index_entries").select("id, product_type, index_depart, index_arrivee, retour_cuve, pumps(name)").eq("entry_id", entry.id),
        db.from("index_tank_readings").select("id, product_type, jauge, tanks(name)").eq("entry_id", entry.id),
      ]);
      if (p.error || t.error) { toast.error("Chargement impossible", { description: (p.error ?? t.error).message }); setPumps([]); return; }
      setPumps(sortNozzles((p.data ?? []).map((r: any) => ({ id: r.id, name: r.pumps?.name ?? "Pistolet", product_type: r.product_type, index_depart: Number(r.index_depart) || 0, index_arrivee: Number(r.index_arrivee) || 0, retour_cuve: Number(r.retour_cuve) || 0 }))));
      setTanks(sortNozzles((t.data ?? []).map((r: any) => ({ id: r.id, name: r.tanks?.name ?? "Cuve", product_type: r.product_type, jauge: r.jauge == null ? null : Number(r.jauge) }))));
    })();
  }, [open, entry]);

  const num = (v: string) => Math.max(0, parseFloat(v) || 0);
  const net = (r: PumpRow) => r.index_arrivee - r.index_depart - r.retour_cuve;
  const invalid = useMemo(() => (pumps ?? []).some((r) => r.index_arrivee < r.index_depart || net(r) < 0), [pumps]);

  const handleSave = async () => {
    if (!entry || !pumps) return;
    if (invalid) return toast.error("Index d'arrivée inférieur au départ ou retour cuve trop élevé");
    setSaving(true);
    try {
      for (const r of pumps) {
        const { error } = await db.from("pump_index_entries").update({ index_arrivee: r.index_arrivee, retour_cuve: r.retour_cuve }).eq("id", r.id);
        if (error) throw error;
      }
      for (const t of tanks) {
        const { error } = await db.from("index_tank_readings").update({ jauge: t.jauge }).eq("id", t.id);
        if (error) throw error;
      }
      const { error } = await db.from("index_entries").update({ ...money, versement_banque_ref: bv || null }).eq("id", entry.id);
      if (error) throw error;
      queryClient.invalidateQueries();
      toast.success("Saisie modifiée avec succès");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erreur lors de la modification", { description: err.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la saisie — {entry?.stations?.name} — {entry?.entry_date && new Date(entry.entry_date).toLocaleDateString("fr-FR")}</DialogTitle>
        </DialogHeader>
        {!pumps ? <Skeleton className="h-64 w-full" /> : (
          <div className="space-y-5">
            {pumps.length === 0 ? <p className="text-sm text-muted-foreground">Ancien format : aucun détail par pistolet à modifier.</p> : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>{["Pistolet", "Produit", "Index départ", "Index arrivée", "Retour cuve", "Sortie réelle (L)"].map((h, i) => <th key={h} className={`p-2 ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {pumps.map((r, i) => (
                      <tr key={r.id} className="border-t border-border/50">
                        <td className="p-2 font-medium">{r.name}</td>
                        <td className="p-2 uppercase text-muted-foreground">{r.product_type}</td>
                        <td className="p-2 text-right">{r.index_depart.toLocaleString("fr-FR")}</td>
                        <td className="p-1"><Input type="number" min="0" step="0.01" className="h-8 text-right" value={r.index_arrivee}
                          onChange={(e) => setPumps((ps) => ps!.map((x, j) => j === i ? { ...x, index_arrivee: num(e.target.value) } : x))} /></td>
                        <td className="p-1"><Input type="number" min="0" step="0.01" className="h-8 text-right" value={r.retour_cuve}
                          onChange={(e) => setPumps((ps) => ps!.map((x, j) => j === i ? { ...x, retour_cuve: num(e.target.value) } : x))} /></td>
                        <td className={`p-2 text-right font-semibold ${net(r) < 0 ? "text-destructive" : ""}`}>{net(r).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!!tanks.length && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-primary">Jauges du soir</h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  {tanks.map((t, i) => (
                    <div key={t.id} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.name}</Label>
                      <Input type="number" min="0" className="h-8" value={t.jauge ?? ""}
                        onChange={(e) => setTanks((ts) => ts.map((x, j) => j === i ? { ...x, jauge: e.target.value === "" ? null : num(e.target.value) } : x))} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-2 text-sm font-medium text-primary">Déductions & versement</h4>
              <div className="grid gap-2 sm:grid-cols-3">
                {MONEY_FIELDS.map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input type="number" min="0" className="h-8" value={money[k] ?? 0} onChange={(e) => setMoney((m) => ({ ...m, [k]: num(e.target.value) }))} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">N° bordereau (BV)</Label>
                  <Input className="h-8" value={bv} maxLength={60} onChange={(e) => setBv(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !pumps || invalid} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
