import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignaturePad, DECISION_LABEL } from "@/components/pro/EcmrSignDialog";
import { blQuantities, roleLabel, varianceLabel, type BlRole, type DeliveryNote } from "@/lib/deliveryNotes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const fmt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("fr-FR"));
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${fmt(v)} L`);

export function VarianceBadge({ v, pct }: { v: number | null; pct?: number | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={v < 0 ? "destructive" : "outline"} className={v === 0 ? "border-primary text-primary" : ""}>{signed(v)}{pct != null ? ` (${pct.toFixed(2)} %)` : ""} · {varianceLabel(v)}</Badge>;
}

/** Tableau BL : volume chargé, quantité réellement dépotée et écart chauffeur par compartiment. */
export function BlQuantitiesTable({ note }: { note: DeliveryNote }) {
  const q = blQuantities(note);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Comp.</TableHead><TableHead>Produit</TableHead><TableHead className="text-right">Volume BL (L)</TableHead><TableHead className="text-right">Qté dépotée (L)</TableHead><TableHead className="text-right">Écart chauffeur</TableHead></TableRow></TableHeader>
      <TableBody>
        {q.lines.map((l) => (
          <TableRow key={l.load_id}>
            <TableCell>{l.compartment ?? "—"}</TableCell><TableCell>{l.product}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(l.litres)}</TableCell>
            <TableCell className="text-right tabular-nums">{l.received === null ? <span className="text-muted-foreground">Non dépoté</span> : fmt(l.received)}</TableCell>
            <TableCell className="text-right"><VarianceBadge v={l.variance} pct={l.variancePct} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter><TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right tabular-nums">{fmt(q.bl)}</TableCell><TableCell className="text-right tabular-nums">{fmt(q.received)}</TableCell><TableCell className="text-right"><VarianceBadge v={q.variance} /></TableCell></TableRow></TableFooter>
    </Table>
  );
}

/** Signature d'un BL. Le chauffeur n'a pas de compte : il signe sur l'appareil de l'utilisateur connecté, à son nom issu du camion. */
export function BlSignDialog({ sign, onClose, onDone }: { sign: { note: DeliveryNote; role: BlRole } | null; onClose: () => void; onDone: () => void }) {
  const [png, setPng] = useState<string | null>(null);
  const [decision, setDecision] = useState("accepted");
  const [reserves, setReserves] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPng(null); setDecision("accepted"); setReserves(""); }, [sign?.note.id, sign?.role]);
  const submit = async () => {
    if (!sign) return;
    setBusy(true);
    const { error } = await db.rpc("logistics_bl_action", { _action: "sign", _id: sign.note.id, _data: { role: sign.role, png, decision, reserves } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(sign.role === "carrier" ? `Signature du chauffeur ${sign.note.snapshot.driver} enregistrée` : "Signature enregistrée");
    onClose(); onDone();
  };
  const driver = sign?.role === "carrier";
  return (
    <Dialog open={!!sign} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{sign && roleLabel(sign.note, sign.role)} · {sign?.note.number}</DialogTitle></DialogHeader>
        {sign && <div className="text-sm space-y-1">
          <div>{sign.note.snapshot.site} · Camion {sign.note.snapshot.truck ?? "—"}{sign.note.snapshot.tanker ? ` + ${sign.note.snapshot.tanker}` : ""}</div>
          {driver && <div className="rounded-md border border-primary/40 bg-primary/5 p-2">Chauffeur : <b>{sign.note.snapshot.driver || "—"}</b>{sign.note.snapshot.license ? ` · Permis ${sign.note.snapshot.license}` : ""}<div className="text-xs text-muted-foreground">Remettez l'appareil au chauffeur : il signe ci-dessous avec le doigt.</div></div>}
        </div>}
        {sign && (sign.role !== "shipper") && <BlQuantitiesTable note={sign.note} />}
        {sign?.role === "consignee" && <>
          <div className="space-y-1"><Label>Décision</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["accepted", "accepted_with_reserves", "refused"].map((d) => <SelectItem key={d} value={d}>{DECISION_LABEL[d]}</SelectItem>)}</SelectContent></Select></div>
          {decision !== "accepted" && <div className="space-y-1"><Label>Motif / réserves</Label><Textarea value={reserves} onChange={(e) => setReserves(e.target.value)} maxLength={1000} /></div>}
        </>}
        <SignaturePad key={(sign?.note.id ?? "") + (sign?.role ?? "")} onChange={setPng} />
        <p className="text-xs text-muted-foreground">{driver ? "Signature enregistrée au nom du chauffeur, recueillie depuis votre compte, horodatée et non modifiable." : "Signature enregistrée au nom de votre compte, horodatée et non modifiable."}</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={busy || !png || (decision !== "accepted" && sign?.role === "consignee" && reserves.trim().length < 3)} onClick={submit}>{driver ? "Valider la signature du chauffeur" : "Signer"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
