import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, PenLine, RefreshCw, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignaturePad, DECISION_LABEL } from "@/components/pro/EcmrSignDialog";
import { BL_ROLES, BL_ROLE_LABEL, blDecision, nextSignatureRole, signatureProgress, type BlRole, type DeliveryNote } from "@/lib/deliveryNotes";
import { exportDeliveryNote } from "@/lib/deliveryNoteExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function DeliveryNotesTab({ trips, canValidate, onChanged }: { trips: Row[]; canValidate: boolean; onChanged: () => void }) {
  const { tenantId, countryId } = useScope();
  const { user } = useAuth();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [portal, setPortal] = useState<Row[]>([]);
  const [noteClient, setNoteClient] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState<DeliveryNote | null>(null);
  const [who, setWho] = useState<Record<BlRole, string>>({ shipper: "", carrier: "", consignee: "" });
  const [sign, setSign] = useState<{ note: DeliveryNote; role: BlRole } | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [decision, setDecision] = useState("accepted");
  const [reserves, setReserves] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    const [n, p] = await Promise.all([
      db.rpc("logistics_bl_overview", { _tenant: tenantId, _country: countryId, _offset: 0 }),
      db.from("profiles").select("user_id,full_name").eq("tenant_id", tenantId).eq("is_active", true).order("full_name"),
    ]);
    if (n.error) toast.error(n.error.message); else setNotes(n.data ?? []);
    setPeople(p.data ?? []);
    const [pu, nc] = await Promise.all([
      db.from("b2b_portal_users").select("user_id,full_name,client_id").eq("tenant_id", tenantId).eq("country_id", countryId).eq("active", true).eq("can_manage", true),
      db.from("logistics_delivery_notes").select("id,client_id").eq("tenant_id", tenantId).eq("country_id", countryId),
    ]);
    setPortal(pu.data ?? []);
    setNoteClient(Object.fromEntries((nc.data ?? []).map((x: Row) => [x.id, x.client_id])));
  }, [tenantId, countryId]);
  useEffect(() => { load(); }, [load]);

  const run = async (action: string, id: string, data: Row, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("logistics_bl_action", { _action: action, _id: id, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); await load(); onChanged(); return true;
  };
  const pending = trips.filter((t) => t.loaded_at && !["planned", "loading", "cancelled"].includes(t.status) && !notes.some((n) => n.trip_id === t.id));
  const personName = (id: string | null) => people.find((p) => p.user_id === id)?.full_name ?? (portal.find((p) => p.user_id === id) ? `${portal.find((p) => p.user_id === id)?.full_name} (client)` : id ? "Compte client" : "—");

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Bons de livraison numériques ({notes.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <p className="text-xs text-muted-foreground">Un BL est créé par destination à la fin du chargement. Signatures dans l'ordre : responsable logistique, chauffeur, puis destinataire après confirmation de la livraison du site. Chaque personne signe avec son propre compte.</p>
        {canValidate && pending.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
            <span>Transport {t.reference} chargé sans BL</span>
            <Button size="sm" disabled={busy} onClick={() => run("generate", t.id, {}, "BL générés")}>Générer les BL</Button>
          </div>
        ))}
        <Table>
          <TableHeader><TableRow><TableHead>N° BL</TableHead><TableHead>BE / transport</TableHead><TableHead>Destination</TableHead><TableHead className="text-right">Volume BL (L)</TableHead><TableHead>Signataires</TableHead><TableHead>Visas</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {!notes.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Aucun bon de livraison</TableCell></TableRow>}
            {notes.map((n) => {
              const done = signatureProgress(n.signatures); const dec = blDecision(n.signatures); const mine = user ? nextSignatureRole(n, user.id) : null;
              return (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">{n.number}</TableCell>
                  <TableCell className="text-xs">{n.snapshot.be ?? "—"}<br />{n.snapshot.trip}</TableCell>
                  <TableCell>{n.snapshot.site}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.snapshot.lines.reduce((s, l) => s + Number(l.litres), 0).toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="text-xs">{BL_ROLES.map((r) => <div key={r}>{BL_ROLE_LABEL[r]} : {personName(n[`${r}_user`])}</div>)}</TableCell>
                  <TableCell><Badge variant={dec === "refused" ? "destructive" : done === 3 ? "outline" : "secondary"}>{done}/3{done === 3 ? ` · ${DECISION_LABEL[dec]}` : ""}</Badge></TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    {canValidate && done === 0 && n.trip_status !== "cancelled" && <Button size="sm" variant="outline" title="Désigner les signataires" onClick={() => { setAssign(n); setWho({ shipper: n.shipper_user ?? "", carrier: n.carrier_user ?? "", consignee: n.consignee_user ?? "" }); }}><UserCheck className="h-4 w-4" /></Button>}
                    {mine && <Button size="sm" onClick={() => { setSign({ note: n, role: mine }); setPng(null); setDecision("accepted"); setReserves(""); }}><PenLine className="h-4 w-4 mr-1" />Signer</Button>}
                    <Button size="sm" variant="ghost" title="PDF" onClick={() => exportDeliveryNote(n).catch((e) => toast.error(String(e)))}><FileDown className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!assign} onOpenChange={(v) => !v && setAssign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Signataires du {assign?.number}</DialogTitle></DialogHeader>
          {BL_ROLES.map((r) => <div key={r} className="space-y-1"><Label>{BL_ROLE_LABEL[r]}</Label>
            <Select value={who[r]} onValueChange={(v) => setWho({ ...who, [r]: v })}><SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
              <SelectContent>{people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id}</SelectItem>)}
                {r === "consignee" && assign && portal.filter((p) => p.client_id && p.client_id === noteClient[assign.id]).map((p) => <SelectItem key={"c" + p.user_id} value={p.user_id}>{p.full_name} · Espace client</SelectItem>)}</SelectContent></Select></div>)}
          <p className="text-xs text-muted-foreground">Le destinataire d'une station doit être affecté à cette station. Pour un client B2B, choisissez son compte « Espace client » : il signera depuis son espace.</p>
          <DialogFooter><Button variant="outline" onClick={() => setAssign(null)}>Annuler</Button>
            <Button disabled={busy || !who.shipper || !who.carrier || !who.consignee} onClick={async () => { if (assign && await run("assign", assign.id, who, "Signataires enregistrés")) setAssign(null); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sign} onOpenChange={(v) => !v && setSign(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{sign && BL_ROLE_LABEL[sign.role]} · {sign?.note.number}</DialogTitle></DialogHeader>
          {sign?.role === "consignee" && <>
            <div className="space-y-1"><Label>Décision</Label><Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["accepted", "accepted_with_reserves", "refused"].map((d) => <SelectItem key={d} value={d}>{DECISION_LABEL[d]}</SelectItem>)}</SelectContent></Select></div>
            {decision !== "accepted" && <div className="space-y-1"><Label>Motif / réserves</Label><Textarea value={reserves} onChange={(e) => setReserves(e.target.value)} maxLength={1000} /></div>}
          </>}
          <SignaturePad key={sign?.note.id + (sign?.role ?? "")} onChange={setPng} />
          <p className="text-xs text-muted-foreground">Signature enregistrée au nom de votre compte, horodatée et non modifiable.</p>
          <DialogFooter><Button variant="outline" onClick={() => setSign(null)}>Annuler</Button>
            <Button disabled={busy || !png || (decision !== "accepted" && sign?.role === "consignee" && reserves.trim().length < 3)} onClick={async () => { if (sign && await run("sign", sign.note.id, { role: sign.role, png, decision, reserves }, "Signature enregistrée")) setSign(null); }}>Signer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}