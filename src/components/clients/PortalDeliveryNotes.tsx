import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignaturePad, DECISION_LABEL } from "@/components/pro/EcmrSignDialog";
import { blDecision, nextSignatureRole, signatureProgress, type DeliveryNote } from "@/lib/deliveryNotes";
import { exportDeliveryNote } from "@/lib/deliveryNoteExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Client space: the client's delivery notes; the designated client user signs as consignee. */
export function PortalDeliveryNotes({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [sign, setSign] = useState<DeliveryNote | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [decision, setDecision] = useState("accepted");
  const [reserves, setReserves] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await db.rpc("b2b_portal_delivery_notes");
    if (error) toast.error(error.message); else setNotes(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    if (!sign) return;
    setBusy(true);
    const { error } = await db.rpc("logistics_bl_action", { _action: "sign", _id: sign.id, _data: { role: "consignee", png, decision, reserves } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Réception signée"); setSign(null); load();
  };
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>N° BL</TableHead><TableHead>Date</TableHead><TableHead>Livraison</TableHead><TableHead className="text-right">Litres</TableHead><TableHead>Visas</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {!notes.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucun bon de livraison.</TableCell></TableRow>}
          {notes.map((n) => {
            const done = signatureProgress(n.signatures); const dec = blDecision(n.signatures);
            const mine = canManage && user && nextSignatureRole(n, user.id) === "consignee";
            const waiting = n.consignee_user === user?.id && done < 3 && !mine;
            return (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs">{n.number}</TableCell>
                <TableCell>{new Date(n.created_at).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell className="text-xs">{n.snapshot.site}<br />{n.snapshot.truck}</TableCell>
                <TableCell className="text-right tabular-nums">{n.snapshot.lines.reduce((s, l) => s + Number(l.litres), 0).toLocaleString("fr-FR")}</TableCell>
                <TableCell><Badge variant={dec === "refused" ? "destructive" : done === 3 ? "outline" : "secondary"}>{done}/3{done === 3 ? ` · ${DECISION_LABEL[dec]}` : waiting ? " · en attente" : ""}</Badge></TableCell>
                <TableCell className="flex gap-1">
                  {mine && <Button size="sm" onClick={() => { setSign(n); setPng(null); setDecision("accepted"); setReserves(""); }}><PenLine className="mr-1 h-4 w-4" />Signer la réception</Button>}
                  <Button size="sm" variant="ghost" title="PDF" onClick={() => exportDeliveryNote(n).catch((e) => toast.error(String(e)))}><FileDown className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Dialog open={!!sign} onOpenChange={(v) => !v && setSign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Réception · {sign?.number}</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>Décision</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["accepted", "accepted_with_reserves", "refused"].map((d) => <SelectItem key={d} value={d}>{DECISION_LABEL[d]}</SelectItem>)}</SelectContent></Select></div>
          {decision !== "accepted" && <div className="space-y-1"><Label>Motif / réserves</Label><Textarea value={reserves} onChange={(e) => setReserves(e.target.value)} maxLength={1000} /></div>}
          <SignaturePad key={sign?.id} onChange={setPng} />
          <p className="text-xs text-muted-foreground">Signature enregistrée à votre nom, horodatée et non modifiable.</p>
          <DialogFooter><Button variant="outline" onClick={() => setSign(null)}>Annuler</Button>
            <Button disabled={busy || !png || (decision !== "accepted" && reserves.trim().length < 3)} onClick={submit}>Signer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
