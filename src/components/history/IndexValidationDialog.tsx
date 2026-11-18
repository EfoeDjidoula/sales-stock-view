import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IndexEntry } from "@/hooks/useIndexEntries";
import { useDayCardTotals } from "@/hooks/useIndexDailyContext";
import { formatNumber } from "@/data/stationsData";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, FileDown, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { buildValidationChecks } from "@/lib/indexValidationChecks";
import { usePdfExport } from "@/hooks/usePdfExport";
import { FUEL_PRICES } from "@/config/prices";

const db = supabase as any;

interface Props {
  entry: IndexEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Row = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "warn" | "ok" }) => (
  <div className="flex items-center justify-between gap-3 py-1 text-sm tabular-nums">
    <span className="text-muted-foreground">{label}</span>
    <span className={`${strong ? "font-semibold" : ""} ${tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : ""}`}>{value}</span>
  </div>
);

/** Fenêtre de décision N+1 : synthèse ventes / règlements / cuves, contrôles, validation ou rejet motivé. */
export const IndexValidationDialog = ({ entry, open, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"validate" | "reject">("validate");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { exportPdf } = usePdfExport();

  useEffect(() => {
    if (open) { setMode("validate"); setText(""); }
  }, [open, entry?.id]);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["index-validation-detail", entry?.id],
    enabled: open && !!entry,
    queryFn: async () => {
      const [pumps, tanks, closure, prior] = await Promise.all([
        db.from("pump_index_entries").select("pump_id, product_type, liters_net, liters_sold, retour_cuve, pumps(name)").eq("entry_id", entry!.id),
        db.from("index_tank_readings").select("tank_id, product_type, stock_ouverture, depotage, sortie, stock_cloture, jauge, ecart, tanks(name)").eq("entry_id", entry!.id),
        db.from("daily_closures").select("id, status, source").eq("station_id", entry!.station_id).eq("closure_date", entry!.entry_date).maybeSingle(),
        db.from("index_entries").select("id", { count: "exact", head: true }).eq("station_id", entry!.station_id).lt("entry_date", entry!.entry_date).neq("status", "valide"),
      ]);
      for (const r of [pumps, tanks, closure, prior]) if (r.error) throw r.error;
      return { pumps: pumps.data ?? [], tanks: tanks.data ?? [], closure: closure.data, priorPending: prior.count ?? 0 };
    },
  });
  const { data: real } = useDayCardTotals(open ? entry?.station_id : undefined, entry?.entry_date);

  const sums = useMemo(() => {
    const net = (p: string) => (detail?.pumps ?? []).filter((r: any) => r.product_type === p).reduce((s: number, r: any) => s + Number(r.liters_net ?? r.liters_sold ?? 0), 0);
    return { superL: net("super"), gasoilL: net("gasoil") };
  }, [detail]);

  if (!entry) return null;
  const n = (v: unknown) => Number(v) || 0;
  const vente = n(entry.vente_globale);
  const deductions = n(entry.autoconso_montant) + n(entry.bons_clients_montant) + n(entry.tickets_valeur_montant) + n(entry.cartes_montant) + n(entry.versement_momo);
  const aVerser = entry.montant_a_verser ?? vente - deductions;
  const verse = n(entry.versement_banque) + n(entry.versement_liquidite);
  const checks = buildValidationChecks({
    ecartVersement: entry.ecart_versement ?? verse - aVerser,
    versementBanque: n(entry.versement_banque),
    bordereau: entry.versement_banque_ref,
    cartesDeclared: n(entry.cartes_montant),
    // Comparaison seulement si la station a enregistré des transactions ce jour (sinon bons papier / cartes hors module)
    cartesReal: real?.fuelCardCount ? real.fuelCards : null,
    bonsDeclared: n(entry.bons_clients_montant),
    bonsReal: real?.b2bCount ? real.b2b : null,
    tanks: (detail?.tanks ?? []).map((t: any) => ({ name: t.tanks?.name ?? "Cuve", ecart: t.ecart == null ? null : Number(t.ecart), jauge: t.jauge == null ? null : Number(t.jauge) })),
    hasPumpDetail: (detail?.pumps ?? []).length > 0,
    priorPending: detail?.priorPending ?? 0,
    closureStatus: detail?.closure?.status ?? null,
  });
  const blocking = checks.some((c) => c.level === "block");
  const locale = "fr-FR";

  const downloadRecap = () => {
    const agg = (p: string) => {
      const rows = (detail?.pumps ?? []).filter((r: any) => r.product_type === p);
      const retour = rows.reduce((s: number, r: any) => s + n(r.retour_cuve), 0);
      const net = rows.reduce((s: number, r: any) => s + n(r.liters_net ?? r.liters_sold), 0);
      return { brut: net + retour, retour, liters: net };
    };
    const su = agg("super"), ga = agg("gasoil");
    const priceS = FUEL_PRICES.SUPER, priceG = FUEL_PRICES.GASOIL;
    const tanks = (detail?.tanks ?? []).map((t: any) => ({
      name: t.tanks?.name ?? "Cuve", product: t.product_type,
      ouverture: n(t.stock_ouverture), depotage: n(t.depotage), sortie: n(t.sortie),
      cloture: n(t.stock_cloture), jauge: n(t.jauge), ecart: n(t.ecart),
    })).sort((a: any, b: any) => (a.product === b.product ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.product === "super" ? -1 : 1));
    exportPdf({
      stationName: entry.stations?.name ?? "Station",
      stationLocation: entry.stations?.location ?? "",
      date: entry.entry_date,
      prices: { super: priceS, gasoil: priceG },
      super: { ...su, amount: su.liters * priceS },
      gasoil: { ...ga, amount: ga.liters * priceG },
      venteGlobale: vente,
      autoconso: n(entry.autoconso_montant),
      bonsClients: n(entry.bons_clients_montant),
      ticketsValeur: n(entry.tickets_valeur_montant),
      cartes: n(entry.cartes_montant),
      momo: n(entry.versement_momo),
      momoRef: entry.versement_momo_ref || undefined,
      montantAVerser: aVerser,
      versementBanque: verse,
      bordereau: entry.versement_banque_ref || undefined,
      banqueNom: entry.banque_nom || undefined,
      ecartVersement: verse - aVerser,
      tanks,
      validation: {
        status: entry.status,
        by: entry.status === "rejete" ? entry.rejected_by_name : entry.validated_by_name,
        at: entry.status === "rejete" ? entry.rejected_at : entry.validated_at,
        reason: entry.rejection_reason,
      },
    });
  };

  const submit = async () => {
    if (mode === "reject" && !text.trim()) return toast.error("Indiquez le motif du rejet");
    setBusy(true);
    const { data, error } = mode === "validate"
      ? await db.rpc("validate_index_entry", { _id: entry.id, _comment: text.trim() || null })
      : await db.rpc("reject_index_entry", { _id: entry.id, _reason: text.trim() });
    setBusy(false);
    if (error) return toast.error(mode === "validate" ? "Validation impossible" : "Rejet impossible", { description: error.message });
    if (mode === "reject") toast.success("Saisie rejetée : le gérant doit la corriger");
    else {
      const warns: string[] = data?.warnings ?? [];
      if (warns.length) toast.warning("Saisie validée, avec réserves", { description: warns.join(" · ") });
      else toast.success("Saisie validée : stock et clôture du jour mis à jour");
    }
    queryClient.invalidateQueries();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Décision N+1</DialogTitle>
          <DialogDescription>
            {entry.stations?.name ?? "Station"} · {new Date(entry.entry_date).toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <Skeleton className="h-64 w-full" /> : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-1 text-sm font-semibold">Ventes</h4>
                <Row label="Super — sortie réelle" value={`${formatNumber(sums.superL)} L`} />
                <Row label="Gasoil — sortie réelle" value={`${formatNumber(sums.gasoilL)} L`} />
                <Row label="Vente globale" value={`${formatNumber(vente)} FCFA`} strong />
              </div>
              <div className="rounded-lg border border-border p-3">
                <h4 className="mb-1 text-sm font-semibold">Règlements & versement</h4>
                <Row label="Autoconsommation" value={formatNumber(n(entry.autoconso_montant))} />
                <Row label={`Bons clients${real?.b2bCount ? ` (B2B réel ${formatNumber(real.b2b)})` : ""}`} value={formatNumber(n(entry.bons_clients_montant))} tone={real?.b2bCount && Math.round(real.b2b) !== Math.round(n(entry.bons_clients_montant)) ? "warn" : undefined} />
                <Row label="Tickets valeur" value={formatNumber(n(entry.tickets_valeur_montant))} />
                <Row label={`Ventes par carte${real?.fuelCardCount ? ` (Fuel Cards ${formatNumber(real.fuelCards)})` : ""}`} value={formatNumber(n(entry.cartes_montant))} tone={real?.fuelCardCount && Math.round(real.fuelCards) !== Math.round(n(entry.cartes_montant)) ? "warn" : undefined} />
                <Row label="Mobile Money" value={formatNumber(n(entry.versement_momo))} />
                <Row label="Montant à verser" value={`${formatNumber(aVerser)} FCFA`} strong />
                <Row label={`Versé en banque${entry.versement_banque_ref ? ` · BV ${entry.versement_banque_ref}` : ""}${entry.banque_nom ? ` · ${entry.banque_nom}` : ""}`} value={`${formatNumber(verse)} FCFA`} />
                <Row label="Écart sur versement" value={`${formatNumber(verse - aVerser)} FCFA`} strong tone={Math.round(verse - aVerser) === 0 ? "ok" : "warn"} />
              </div>
            </div>

            {!!detail?.tanks.length && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs tabular-nums">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>{["Cuve", "Ouverture", "Dépotage", "Sorties", "Théorique", "Jauge", "Écart"].map((h, i) => <th key={h} className={`p-2 ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {detail.tanks.map((t: any) => (
                      <tr key={t.tank_id} className="border-t border-border/50">
                        <td className="p-2 font-medium">{t.tanks?.name ?? "—"} <span className="uppercase text-muted-foreground">{t.product_type}</span></td>
                        <td className="p-2 text-right">{formatNumber(n(t.stock_ouverture))}</td>
                        <td className="p-2 text-right">{formatNumber(n(t.depotage))}</td>
                        <td className="p-2 text-right">{formatNumber(n(t.sortie))}</td>
                        <td className="p-2 text-right">{formatNumber(n(t.stock_cloture))}</td>
                        <td className="p-2 text-right">{t.jauge == null ? "—" : formatNumber(n(t.jauge))}</td>
                        <td className={`p-2 text-right font-semibold ${n(t.ecart) === 0 ? "" : "text-warning"}`}>{t.ecart == null ? "—" : formatNumber(n(t.ecart))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold">Contrôles</h4>
              {checks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Aucun écart détecté.</p>
              ) : checks.map((c) => (
                <p key={c.code} className={`flex items-start gap-2 text-sm ${c.level === "block" ? "text-destructive" : c.level === "warn" ? "text-warning" : "text-muted-foreground"}`}>
                  {c.level === "info" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />} {c.message}
                </p>
              ))}
              {detail?.closure && <Badge variant="outline" className="mt-1">Clôture existante : {detail.closure.status}{detail.closure.source === "index" ? " (saisie index)" : " (saisie manuelle)"}</Badge>}
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={mode === "validate" ? "default" : "outline"} onClick={() => setMode("validate")}>Valider</Button>
                <Button type="button" size="sm" variant={mode === "reject" ? "destructive" : "outline"} onClick={() => setMode("reject")}>Rejeter</Button>
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === "validate" ? "Commentaire (facultatif)" : "Motif du rejet (obligatoire) : ex. versement banque non conforme au bordereau"}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={downloadRecap} disabled={busy || isLoading} className="gap-2 sm:mr-auto"><FileDown className="h-4 w-4" /> Récap PDF</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          {mode === "validate" ? (
            <Button onClick={submit} disabled={busy || isLoading || blocking} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Valider la saisie
            </Button>
          ) : (
            <Button variant="destructive" onClick={submit} disabled={busy || !text.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Rejeter la saisie
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
