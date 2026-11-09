import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Eraser, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const ROLE_LABEL: Record<string, string> = { shipper: "Expéditeur (dépôt)", carrier: "Transporteur / chauffeur", consignee: "Destinataire" };
export const DECISION_LABEL: Record<string, string> = { signed: "Signé", accepted: "Reçu conforme", accepted_with_reserves: "Reçu avec réserves", refused: "Refusé" };

function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#111111";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (ref.current!.width / r.width), (e.clientY - r.top) * (ref.current!.height / r.height)]; };
  const down = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const [x, y] = pos(e); const ctx = ref.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = ref.current!.getContext("2d")!; ctx.lineTo(x, y); ctx.stroke(); dirty.current = true; };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(dirty.current ? ref.current!.toDataURL("image/png") : null); };
  const clear = () => { const c = ref.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); dirty.current = false; onChange(null); };
  return (
    <div className="space-y-1">
      <canvas ref={ref} width={500} height={160} className="w-full rounded-md border border-border touch-none bg-card cursor-crosshair"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <Button type="button" size="sm" variant="ghost" onClick={clear}><Eraser className="h-4 w-4 mr-1" />Effacer</Button>
    </div>
  );
}

export interface CmrSite { key: string; label: string; delivered: boolean }

interface Props { trip: Row | null; sites: CmrSite[]; signatures: Row[]; onClose: () => void; onSaved: (receipt?: Row) => void }

export function EcmrSignDialog({ trip, sites, signatures, onClose, onSaved }: Props) {
  const [role, setRole] = useState("shipper");
  const [site, setSite] = useState("");
  const [name, setName] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [decision, setDecision] = useState("accepted");
  const [reserves, setReserves] = useState("");
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const sigs = signatures.filter((s) => s.trip_id === trip?.id);
  const has = (r: string, k = "") => sigs.find((s) => s.role === r && s.site_key === k);
  useEffect(() => { setRole("shipper"); setSite(""); setName(""); setPng(null); setReserves(""); setDecision("accepted"); setPadKey((k) => k + 1); }, [trip?.id]);

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Nom du signataire requis");
    if (!png) return toast.error("Signature manquante");
    if (role === "consignee" && !site) return toast.error("Choisissez le site destinataire");
    if (role === "consignee" && decision !== "accepted" && reserves.trim().length < 3) return toast.error("Précisez les réserves");
    setBusy(true);
    const { data, error } = await db.rpc("logistics_sign_cmr", { _trip: trip!.id, _role: role, _site_key: role === "consignee" ? site : "", _name: name, _png: png, _decision: role === "consignee" ? decision : "signed", _reserves: role === "consignee" ? reserves : null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(role === "consignee" ? `Accusé de réception ${data.receipt_number} émis` : "Signature enregistrée");
    setName(""); setPng(null); setReserves(""); setPadKey((k) => k + 1);
    onSaved(role === "consignee" ? { ...data, site_key: site } : undefined);
  };

  const already = role === "consignee" ? (site ? has("consignee", site) : undefined) : has(role);
  const siteObj = sites.find((s) => s.key === site);

  return (
    <Dialog open={!!trip} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Signature e-CMR — {trip?.reference}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2 text-xs">
            {["shipper", "carrier"].map((r) => <Badge key={r} variant={has(r) ? "outline" : "secondary"}>{has(r) && <CheckCircle2 className="h-3 w-3 mr-1" />}{ROLE_LABEL[r]}</Badge>)}
            {sites.map((s) => { const g = has("consignee", s.key); return <Badge key={s.key} variant={g ? "outline" : "secondary"}>{g && <CheckCircle2 className="h-3 w-3 mr-1" />}{s.label}{g ? ` · ${DECISION_LABEL[g.decision]}` : ""}</Badge>; })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Signataire</Label>
              <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
            {role === "consignee" && <div><Label>Site destinataire</Label>
              <Select value={site} onValueChange={setSite}><SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{sites.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}{s.delivered ? "" : " (non livré)"}</SelectItem>)}</SelectContent></Select></div>}
          </div>
          {already ? <p className="text-sm text-muted-foreground">Déjà signé par <b>{already.signer_name}</b> le {new Date(already.signed_at).toLocaleString("fr-FR")}{already.receipt_number && role === "consignee" ? ` — AR ${already.receipt_number}` : ""}.</p>
          : role === "consignee" && siteObj && !siteObj.delivered ? <p className="text-sm text-destructive">Validez d'abord la livraison de ce site dans le check-in logistique.</p>
          : <>
            <div><Label>Nom et fonction du signataire</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Koffi A., gérant de station" /></div>
            {role === "consignee" && <div className="grid gap-3">
              <div><Label>Décision du destinataire</Label>
                <Select value={decision} onValueChange={setDecision}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["accepted", "accepted_with_reserves", "refused"].map((k) => <SelectItem key={k} value={k}>{DECISION_LABEL[k]}</SelectItem>)}</SelectContent></Select></div>
              {decision !== "accepted" && <div><Label>Réserves / motif</Label><Textarea value={reserves} onChange={(e) => setReserves(e.target.value)} placeholder="Scellé abîmé, manquant constaté…" /></div>}
            </div>}
            <div><Label>Signature (doigt ou souris)</Label><SignaturePad key={padKey} onChange={setPng} /></div>
            <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{role === "consignee" ? "Valider la réception et émettre l'accusé" : "Enregistrer la signature"}</Button>
          </>}
          <p className="text-xs text-muted-foreground">Chaque signature est horodatée, liée à votre compte et ne peut plus être modifiée. Le destinataire signe après la validation de la livraison de son site.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
