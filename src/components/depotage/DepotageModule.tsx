import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Droplets, History, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { useDepotages } from "@/hooks/useDepotages";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = supabase as any;
const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " "));

/** Ouvre l'onglet Logistique (demandes d'appro → réception avec jauges). */
const openLogistics = () => window.dispatchEvent(new CustomEvent("lumatek:open-tab", { detail: "logistique_avancee" }));

/**
 * Dépotages : source unique = réceptions validées de la Logistique (jauges avant/après, BL, chauffeur).
 * Ce sont elles qui alimentent automatiquement la saisie des index et le stock officiel.
 * L'ancien registre n'est plus alimenté ; ses lignes restent consultables.
 */
export const DepotageModule = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { scopeQuery, tenantId, countryId } = useScope();
  const { depotages: legacy, loading: legacyLoading } = useDepotages();
  const { can } = usePermissions();
  const canFix = can("supplies.validate");
  const qc = useQueryClient();
  const [target, setTarget] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reverse = async () => {
    if (!reason.trim()) return toast.error(t("Un motif est obligatoire"));
    setBusy(true);
    const { error } = await db.rpc("supply_reception_reverse", { _id: target.id, _reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Dépotage annulé et stock corrigé"));
    setTarget(null); setReason("");
    qc.invalidateQueries();
  };

  const { data: receptions = [], isLoading } = useQuery({
    queryKey: ["depotage-receptions", tenantId, countryId],
    enabled: !!user && !!tenantId,
    queryFn: async () => {
      const { data, error } = await scopeQuery(
        db.from("supply_requests").select(
          "id, reference, received_at, qty_loaded, qty_delivered, qty_received, gauge_before, gauge_after, delivery_variance, bl_number, driver_name, vehicle_registration, stations(name), tanks(name), petroleum_products(name)",
        ),
      )
        .eq("status", "received")
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold">{t("Gestion des dépotages")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Les dépotages proviennent des réceptions validées en Logistique ; ils sont repris automatiquement dans la saisie des index et le stock.")}
          </p>
        </div>
        <Button className="gap-2" onClick={openLogistics}>
          <Truck className="h-4 w-4" /> {t("Saisir une réception")} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Droplets className="h-5 w-5 text-primary" /> {t("Réceptions validées")}</CardTitle>
          <CardDescription>{t("Logistique → Demandes d'appro. → Réception : jauges avant / après, quantité reçue et écart.")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : receptions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Droplets className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p>{t("Aucune réception validée")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Référence")}</TableHead>
                    <TableHead>{t("Station")}</TableHead>
                    <TableHead>{t("Cuve")}</TableHead>
                    <TableHead>{t("Produit")}</TableHead>
                    <TableHead>{t("Camion")}</TableHead>
                    <TableHead>BL</TableHead>
                    <TableHead className="text-right">{t("Dépotage (BL chargé)")}</TableHead>
                    <TableHead className="text-right">{t("Jauge avant")}</TableHead>
                    <TableHead className="text-right">{t("Jauge après")}</TableHead>
                    <TableHead className="text-right">{t("Constatée")}</TableHead>
                    <TableHead className="text-right">{t("Écart camion")}</TableHead>
                    {canFix && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receptions.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.received_at ? format(new Date(r.received_at), "dd MMM yyyy HH:mm", { locale: fr }) : "—"}</TableCell>
                      <TableCell className="font-medium">{r.reference}</TableCell>
                      <TableCell>{r.stations?.name ?? "—"}</TableCell>
                      <TableCell>{r.tanks?.name ?? "—"}</TableCell>
                      <TableCell>{r.petroleum_products?.name ?? "—"}</TableCell>
                      <TableCell>{r.vehicle_registration ?? "—"}{r.driver_name ? ` · ${r.driver_name}` : ""}</TableCell>
                      <TableCell>{r.bl_number ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(Number(r.qty_loaded) > 0 ? r.qty_loaded : r.qty_received)} L</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.gauge_before)} L</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.gauge_after)} L</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.qty_received)} L</TableCell>
                      {(() => { const gap = Number(r.qty_loaded) > 0 ? (Number(r.qty_received) || 0) - Number(r.qty_loaded) : 0; return <TableCell className={`text-right tabular-nums font-semibold ${gap ? "text-warning" : ""}`}>{fmt(gap)} L</TableCell>; })()}
                      {canFix && <TableCell><Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => setTarget(r)}><Undo2 className="h-4 w-4" />{t("Annuler")}</Button></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Annuler ce dépotage")}</DialogTitle>
            <DialogDescription>
              {target?.reference} · {target?.tanks?.name} · {fmt(Number(target?.qty_loaded) > 0 ? target?.qty_loaded : target?.qty_received)} L. {t("Le stock de la cuve sera diminué d'autant par un ajustement tracé ; l'opération reste visible dans l'historique. Ressaisissez ensuite la bonne réception en Logistique si nécessaire.")}
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder={t("Motif de l'annulation (obligatoire)")} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>{t("Fermer")}</Button>
            <Button variant="destructive" disabled={busy} onClick={reverse}>{t("Confirmer l'annulation")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(legacyLoading || legacy.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> {t("Ancien registre des dépotages")}</CardTitle>
            <CardDescription>{t("Consultation seule : ce registre n'est plus alimenté.")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {legacyLoading ? <Skeleton className="m-4 h-8" /> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Date")}</TableHead>
                      <TableHead>{t("Station")}</TableHead>
                      <TableHead>{t("Cuve")}</TableHead>
                      <TableHead>{t("Produit")}</TableHead>
                      <TableHead>{t("Immat. camion")}</TableHead>
                      <TableHead className="text-right">{t("À dépoter")}</TableHead>
                      <TableHead className="text-right">{t("Dépotée")}</TableHead>
                      <TableHead className="text-right">{t("Jauge après")}</TableHead>
                      <TableHead className="text-right">{t("Écart")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legacy.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{format(new Date(d.depotage_date), "dd MMM yyyy", { locale: fr })}</TableCell>
                        <TableCell>{d.station?.name || "—"}</TableCell>
                        <TableCell>{d.tank?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{d.product_type === "super" ? "Super" : "Gasoil"}</Badge></TableCell>
                        <TableCell>{d.truck_registration}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.quantity_to_unload)} L</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.quantity_unloaded)} L</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.gauge_after)} L</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.ecart)} L</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
