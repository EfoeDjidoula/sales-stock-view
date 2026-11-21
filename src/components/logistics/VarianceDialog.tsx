import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VARIANCE_CATEGORIES, rectifyPreview } from "./variance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface Props {
  trip: Row | null; onClose: () => void; onSaved: () => void;
  loads: Row[]; deliveries: Row[]; compartments: Row[]; products: Row[]; stations: Row[]; clients: Row[];
  L: (fr: string, en: string) => string;
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));

/** Rectifier les quantités livrées (compartiments non confirmés) ou justifier l'écart d'un transport livré. */
export const VarianceDialog = ({ trip, onClose, onSaved, loads, deliveries, compartments, products, stations, clients, L }: Props) => {
  const tripLoads = useMemo(() => loads.filter((l) => l.trip_id === trip?.id).sort((a, b) => a.stop_order - b.stop_order), [loads, trip?.id]);
  const tripDel = useMemo(() => deliveries.filter((x) => x.trip_id === trip?.id), [deliveries, trip?.id]);
  const hasPlan = tripLoads.length > 0;
  const editable = tripLoads.filter((l) => !tripDel.some((x) => x.load_id === l.id));
  const [tab, setTab] = useState("rectify");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("perte_transport");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setInputs({}); setTotal(""); setReason(""); setCategory("perte_transport"); setTab(editable.length || !hasPlan ? "rectify" : "justify"); }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded = Number(trip?.qty_loaded) || 0;
  const tol = Number(trip?.tolerance_pct) || 0;
  const p = rectifyPreview(tripLoads, tripDel, inputs, loaded, tol);
  const totalNum = Number(total.replace(",", "."));
  const newTotal = hasPlan ? p.total : totalNum || 0;
  const newVar = newTotal - loaded;
  const variance = (Number(trip?.qty_delivered) || 0) - loaded;

  const nm = (list: Row[], id: string) => list.find((x) => x.id === id)?.name ?? "—";
  const dest = (l: Row) => (l.destination_type === "client" ? `${L("Client", "Client")} ${nm(clients, l.client_id)}` : nm(stations, l.station_id));
  const reasonOk = reason.trim().length >= 5;

  const submit = async (action: "rectify" | "justify") => {
    let data: Row = {};
    if (action === "rectify") {
      if (hasPlan) {
        if (!p.valid) return toast.error(L("Saisissez une quantité valide pour chaque compartiment non confirmé", "Enter a valid quantity for each unconfirmed compartment"));
        data = { lines: editable.map((l) => ({ load_id: l.id, qty_delivered: inputs[l.id] })) };
      } else {
        if (!(totalNum > 0) || totalNum > loaded) return toast.error(L("Quantité livrée invalide", "Invalid delivered quantity"));
        data = { qty_delivered: totalNum };
      }
    } else data = { category };
    setBusy(true);
    const { error } = await db.rpc("logistics_variance_action", { _trip: trip!.id, _action: action, _reason: reason.trim(), _data: data });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(action === "rectify" ? L("Livraison rectifiée (historique conservé)", "Delivery rectified (history kept)") : L("Écart justifié (historique conservé)", "Variance justified (history kept)"));
    onSaved(); onClose();
  };

  return (
    <Dialog open={!!trip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{L("Écart de livraison", "Delivery variance")} — {trip?.reference}</DialogTitle>
          <DialogDescription>
            {L("Chargé", "Loaded")} <b>{fmt(loaded)} L</b> · {L("livré enregistré", "recorded delivered")} <b>{fmt(trip?.qty_delivered)} L</b> · {L("écart", "variance")} <b className={variance < 0 ? "text-negative" : ""}>{fmt(variance)} L</b> · {L("tolérance", "tolerance")} {tol} % ({fmt((loaded * tol) / 100)} L)
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="rectify">{L("Rectifier la livraison", "Rectify delivery")}</TabsTrigger>
            <TabsTrigger value="justify">{L("Justifier l'écart", "Justify variance")}</TabsTrigger>
          </TabsList>
          <TabsContent value="rectify" className="space-y-3">
            {hasPlan ? (
              <>
                <div className="max-h-[40vh] overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>{L("Comp.", "Comp.")}</TableHead><TableHead>{L("Produit", "Product")}</TableHead><TableHead>{L("Destination", "Destination")}</TableHead><TableHead className="text-right">{L("Chargé (L)", "Loaded (L)")}</TableHead><TableHead className="text-right w-40">{L("Réellement livré (L)", "Actually delivered (L)")}</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {tripLoads.map((l, i) => { const line = p.lines[i]; return (
                        <TableRow key={l.id}>
                          <TableCell>#{compartments.find((c) => c.id === l.compartment_id)?.position ?? "—"}</TableCell>
                          <TableCell>{nm(products, l.product_id)}</TableCell>
                          <TableCell className="text-xs">{dest(l)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(l.qty_litres)}</TableCell>
                          <TableCell className="text-right">
                            {line.confirmed != null
                              ? <span className="inline-flex items-center gap-1 tabular-nums" title={L("Confirmé sur site : non modifiable, justifiez l'écart", "Confirmed on site: locked, justify the variance")}><Lock className="h-3 w-3 text-muted-foreground" />{fmt(line.confirmed)}</span>
                              : <Input aria-label={`${L("Livré compartiment", "Delivered compartment")} ${i + 1}`} inputMode="decimal" className={`h-8 text-right ${line.error && line.error !== "missing" ? "border-destructive" : ""}`} value={inputs[l.id] ?? ""} placeholder={String(l.qty_litres)} onChange={(e) => setInputs({ ...inputs, [l.id]: e.target.value.replace(/[^0-9.,]/g, "") })} />}
                          </TableCell>
                        </TableRow>
                      ); })}
                    </TableBody>
                  </Table>
                </div>
                {editable.length === 0 && <p className="text-sm text-muted-foreground">{L("Tous les compartiments ont été confirmés sur site : les quantités sont figées. Utilisez « Justifier l'écart ».", "All compartments were confirmed on site: quantities are locked. Use “Justify variance”.")}</p>}
                {p.lines.some((x) => x.error === "over") && <p className="text-sm text-negative">{L("Une quantité dépasse le chargement du compartiment.", "A quantity exceeds the compartment load.")}</p>}
              </>
            ) : (
              <div className="grid gap-1 max-w-xs"><Label htmlFor="rect-total">{L("Quantité réellement livrée (L)", "Actually delivered quantity (L)")}</Label><Input id="rect-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9.,]/g, ""))} /></div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>{L("Nouveau livré", "New delivered")} : <b>{fmt(newTotal)} L</b></span>
              <span>{L("Nouvel écart", "New variance")} : <b className={newVar < 0 ? "text-negative" : ""}>{fmt(newVar)} L</b></span>
              {(hasPlan ? p.complete && p.valid : totalNum > 0) && (Math.abs(newVar) > (loaded * tol) / 100
                ? <Badge variant="destructive">{L("Toujours hors tolérance : à justifier ensuite", "Still out of tolerance: justify next")}</Badge>
                : <Badge variant="outline">{L("Dans la tolérance", "Within tolerance")}</Badge>)}
            </div>
          </TabsContent>
          <TabsContent value="justify" className="space-y-3">
            <div className="grid gap-1 max-w-sm">
              <Label>{L("Cause de l'écart", "Cause of variance")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(VARIANCE_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{L(v[0], v[1])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{L("L'écart justifié sort de la liste des alertes. Une rectification ultérieure le fait réapparaître jusqu'à une nouvelle justification.", "A justified variance leaves the alert list. A later rectification brings it back until justified again.")}</p>
          </TabsContent>
        </Tabs>
        <div className="grid gap-1">
          <Label htmlFor="var-reason">{L("Motif (obligatoire, conservé dans l'historique)", "Reason (required, kept in history)")}</Label>
          <Textarea id="var-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("Ex. : BL et bons de réception des 5 sites contrôlés", "E.g. delivery notes of the 5 sites checked")} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Annuler", "Cancel")}</Button>
          <Button disabled={busy || !reasonOk || (tab === "rectify" && (hasPlan ? !p.valid : !(totalNum > 0)))} onClick={() => void submit(tab as "rectify" | "justify")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{tab === "rectify" ? L("Rectifier", "Rectify") : L("Justifier", "Justify")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
