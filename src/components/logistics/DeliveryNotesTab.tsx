import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, FileDown, PenLine, RefreshCw, Truck, UserCheck } from "lucide-react";
import { BlQuantitiesTable, BlSignDialog, VarianceBadge } from "./BlParts";
import { TankerTruckVisualizer } from "./TankerTruckVisualizer";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DECISION_LABEL } from "@/components/pro/EcmrSignDialog";
import { blDecision, blQuantities, consigneeLabel, nextSignatureRole, roleLabel, signatureProgress, type BlRole, type DeliveryNote } from "@/lib/deliveryNotes";
import { exportDeliveryNote } from "@/lib/deliveryNoteExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function DeliveryNotesTab({ trips, d, canValidate, onChanged, L }: { trips: Row[]; d: Record<string, Row[]>; canValidate: boolean; onChanged: () => void; L: (fr: string, en: string) => string }) {
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
  const [detail, setDetail] = useState<DeliveryNote | null>(null);
  const [visual, setVisual] = useState<DeliveryNote | null>(null);

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
        <p className="text-xs text-muted-foreground">Un BL est créé par destination à la fin du chargement. Visas : responsable logistique (reporté du bon d'enlèvement), chauffeur (sans compte, il signe sur le téléphone du gérant ou du responsable de site, à son nom rattaché au camion), puis gérant de station ou responsable de site / chantier après la livraison. Aucune signature du dépôt.</p>
        {canValidate && pending.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
            <span>Transport {t.reference} chargé sans BL</span>
            <Button size="sm" disabled={busy} onClick={() => run("generate", t.id, {}, "BL générés")}>Générer les BL</Button>
          </div>
        ))}
        <Table>
          <TableHeader><TableRow><TableHead>N° BL</TableHead><TableHead>BE / transport</TableHead><TableHead>Camion / chauffeur</TableHead><TableHead>Destination</TableHead><TableHead className="text-right">Volume BL (L)</TableHead><TableHead className="text-right">Qté dépotée (L)</TableHead><TableHead className="text-right">Écart chauffeur</TableHead><TableHead>Visas</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {!notes.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Aucun bon de livraison</TableCell></TableRow>}
            {notes.map((n) => {
              const done = signatureProgress(n.signatures); const dec = blDecision(n.signatures); const mine = user ? nextSignatureRole(n, user.id, canValidate) : null; const q = blQuantities(n);
              return (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">{n.number}</TableCell>
                  <TableCell className="text-xs">{n.snapshot.be ?? "—"}<br />{n.snapshot.trip}</TableCell>
                  <TableCell className="text-xs">{n.snapshot.truck ?? "—"}{n.snapshot.tanker ? ` / ${n.snapshot.tanker}` : ""}<br /><b>{n.snapshot.driver ?? "—"}</b></TableCell>
                  <TableCell>{n.snapshot.site}<div className="text-xs text-muted-foreground">{consigneeLabel(n)} : {personName(n.consignee_user)}</div></TableCell>
                  <TableCell className="text-right tabular-nums">{q.bl.toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.received === null ? <span className="text-muted-foreground">—</span> : Math.round(q.received).toLocaleString("fr-FR")}{q.received !== null && !q.complete && <div className="text-xs text-muted-foreground">partiel</div>}</TableCell>
                  <TableCell className="text-right"><VarianceBadge v={q.variance} /></TableCell>
                  <TableCell><Badge variant={dec === "refused" ? "destructive" : done === 3 ? "outline" : "secondary"}>{done}/3{done === 3 ? ` · ${DECISION_LABEL[dec]}` : ""}</Badge><div className="text-xs text-muted-foreground mt-1">{n.signatures.map((x) => roleLabel(n, x.role)).join(" · ") || "—"}</div></TableCell>
                  <TableCell className="flex flex-wrap gap-1">
                    {canValidate && done === 0 && n.trip_status !== "cancelled" && <Button size="sm" variant="outline" title="Désigner le destinataire" onClick={() => { setAssign(n); setWho({ shipper: n.shipper_user ?? "", carrier: "", consignee: n.consignee_user ?? "" }); }}><UserCheck className="h-4 w-4" /></Button>}
                    {mine && <Button size="sm" onClick={() => setSign({ note: n, role: mine })}><PenLine className="h-4 w-4 mr-1" />{mine === "carrier" ? "Faire signer le chauffeur" : "Signer"}</Button>}
                    <Button size="sm" variant="ghost" title="Détail des quantités" onClick={() => setDetail(n)}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" title={L("Voir le camion et ses compartiments", "View truck and compartments")} onClick={() => setVisual(n)}><Truck className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>Destinataire du {assign?.number}</DialogTitle></DialogHeader>
          {assign && <p className="text-sm">Chauffeur : <b>{assign.snapshot.driver ?? "—"}</b> (rattaché au camion, signe sans compte). Responsable logistique : {personName(assign.shipper_user)}.</p>}
          {(["consignee", ...(assign?.shipper_user ? [] : ["shipper"])] as BlRole[]).map((r) => <div key={r} className="space-y-1"><Label>{assign ? roleLabel(assign, r) : r}</Label>
            <Select value={who[r]} onValueChange={(v) => setWho({ ...who, [r]: v })}><SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
              <SelectContent>{people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.user_id}</SelectItem>)}
                {r === "consignee" && assign && portal.filter((p) => p.client_id && p.client_id === noteClient[assign.id]).map((p) => <SelectItem key={"c" + p.user_id} value={p.user_id}>{p.full_name} · Espace client</SelectItem>)}</SelectContent></Select></div>)}
          <p className="text-xs text-muted-foreground">Le destinataire d'une station doit être affecté à cette station. Pour un client B2B, choisissez son compte « Espace client » : il signera depuis son espace.</p>
          <DialogFooter><Button variant="outline" onClick={() => setAssign(null)}>Annuler</Button>
            <Button disabled={busy || !who.consignee || (!assign?.shipper_user && !who.shipper)} onClick={async () => { if (assign && await run("assign", assign.id, { shipper: who.shipper, consignee: who.consignee }, "Destinataire enregistré")) setAssign(null); }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <BlSignDialog sign={sign} onClose={() => setSign(null)} onDone={() => { load(); onChanged(); }} />

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.number} · {detail?.snapshot.site}</DialogTitle></DialogHeader>
          {detail && <>
            <div className="grid sm:grid-cols-2 gap-1 text-sm">
              <div>BE : {detail.snapshot.be ?? "—"} · Transport : {detail.snapshot.trip}</div>
              <div>Camion : {detail.snapshot.truck ?? "—"}{detail.snapshot.tanker ? ` / ${detail.snapshot.tanker}` : ""}</div>
              <div>Chauffeur : <b>{detail.snapshot.driver ?? "—"}</b>{detail.snapshot.license ? ` · Permis ${detail.snapshot.license}` : ""}</div>
              <div>{consigneeLabel(detail)} : {personName(detail.consignee_user)}</div>
            </div>
            <BlQuantitiesTable note={detail} />
            <div className="grid sm:grid-cols-3 gap-2">{(["shipper", "carrier", "consignee"] as BlRole[]).map((r) => { const g = detail.signatures.find((x) => x.role === r); return (
              <div key={r} className="rounded-md border border-border p-2 text-xs space-y-1"><div className="font-semibold">{roleLabel(detail, r)}</div>
                {g ? <><img src={g.signature_png} alt={`Signature ${g.signer_name}`} className="h-14 bg-white rounded" /><div>{g.signer_name}</div><div className="text-muted-foreground">{new Date(g.signed_at).toLocaleString("fr-FR")}{r === "consignee" ? ` · ${DECISION_LABEL[g.decision]}` : ""}</div></> : <div className="text-muted-foreground">En attente</div>}</div>); })}</div>
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!visual} onOpenChange={(value) => !value && setVisual(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] min-w-0 max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
          <DialogHeader><DialogTitle>{L("Camion du bon de livraison", "Delivery note truck")} · {visual?.number}</DialogTitle></DialogHeader>
          {visual && (() => {
            const tripLoads = (d.loads ?? []).filter((load) => load.trip_id === visual.trip_id);
            const compartments = tripLoads.length ? tripLoads.map((load, index) => {
              const comp = (d.compartments ?? []).find((item) => item.id === load.compartment_id);
              const station = (d.stations ?? []).find((item) => item.id === load.station_id)?.name;
              const client = (d.clients ?? []).find((item) => item.id === load.client_id)?.name;
              return {
                id: load.compartment_id ?? load.id,
                position: comp?.position ?? index + 1,
                capacity: Number(comp?.capacity_litres ?? load.qty_litres),
                qty: Math.max(0, Number(load.qty_litres) - (d.deliveries ?? []).filter((x) => x.load_id === load.id).reduce((sum, x) => sum + Number(x.qty_delivered || 0), 0)),
                productName: (d.products ?? []).find((item) => item.id === load.product_id)?.name,
                destinationName: station ?? client,
                stopOrder: load.stop_order,
              };
            }) : visual.snapshot.lines.map((line, index) => ({
              id: line.load_id,
              position: line.compartment ?? index + 1,
              capacity: Number(line.litres),
              qty: line.litres,
              productName: line.product,
              destinationName: visual.snapshot.site,
            }));
            return <TankerTruckVisualizer
              registration={visual.snapshot.truck}
              trailerRegistration={visual.snapshot.tanker ?? undefined}
              driverName={visual.snapshot.driver}
              compartments={compartments}
              L={L}
            />;
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}