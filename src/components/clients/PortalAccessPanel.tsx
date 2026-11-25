import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PORTAL_REQUEST_LABEL, PORTAL_STATUS_LABEL, formatMoney } from "@/lib/clientPortal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface PortalUser { user_id: string; full_name: string; email: string; can_manage: boolean; active: boolean; created_at: string }
interface PortalRequest {
  id: string; reference: string; kind: string; amount: number | null; card_id: string | null; message: string; status: string;
  requester_name: string | null; created_at: string; decided_by_name: string | null; decided_at: string | null; decision_comment: string | null;
}

const fnError = async (error: unknown): Promise<string> => {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const b = await ctx.json(); if (b?.error) return b.error; } catch { /* ignore */ }
  }
  return (error as Error)?.message ?? "Erreur";
};

/** Staff view: client-portal logins and requests for one B2B client. */
export const PortalAccessPanel = ({ clientId, clientName }: { clientId: string; clientName: string }) => {
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canEdit = isPlatformAdmin || can("clients", "edit");
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", can_manage: false });
  const [busy, setBusy] = useState(false);
  const [decline, setDecline] = useState<PortalRequest | null>(null);
  const [comment, setComment] = useState("");

  const q = useQuery({
    queryKey: ["portal-access", clientId],
    queryFn: async () => {
      const [users, requests] = await Promise.all([
        db.from("b2b_portal_users").select("user_id,full_name,email,can_manage,active,created_at").eq("client_id", clientId).order("created_at"),
        db.from("b2b_portal_requests").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100),
      ]);
      if (users.error) throw users.error;
      if (requests.error) throw requests.error;
      const cardIds = [...new Set((requests.data as PortalRequest[]).map((r) => r.card_id).filter(Boolean))];
      const cards = cardIds.length ? (await db.from("fuel_cards").select("id,card_number").in("id", cardIds)).data ?? [] : [];
      return { users: users.data as PortalUser[], requests: requests.data as PortalRequest[], cards: cards as { id: string; card_number: string }[] };
    },
  });
  const refresh = () => {
    cache.invalidateQueries({ queryKey: ["portal-access", clientId] });
    cache.invalidateQueries({ queryKey: ["b2b-crm"] });
  };
  const portalUrl = `${window.location.origin}/portail`;

  const create = async () => {
    if (form.password.length < 10 || form.password.length > 72) return toast.error("Le mot de passe doit contenir entre 10 et 72 caractères");
    setBusy(true);
    const { error } = await supabase.functions.invoke("create-portal-user", { body: { ...form, client_id: clientId } });
    setBusy(false);
    if (error) return toast.error(await fnError(error));
    toast.success("Accès créé", { description: `Communiquez au client l'adresse ${portalUrl}, son e-mail et son mot de passe.` });
    setCreating(false);
    setForm({ full_name: "", email: "", password: "", can_manage: false });
    refresh();
  };

  const staff = async (action: string, data: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("b2b_portal_staff_action", { _action: action, _data: data });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(ok);
    setDecline(null); setComment("");
    refresh();
  };

  const users = q.data?.users ?? [];
  const requests = q.data?.requests ?? [];
  const open = requests.filter((r) => r.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <div>
          <div className="text-sm font-medium">Adresse de l'espace client</div>
          <div className="font-mono text-sm text-muted-foreground" translate="no">{portalUrl}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(portalUrl); toast.success("Adresse copiée"); }}>
            <Copy className="mr-2 size-4" />Copier
          </Button>
          {canEdit && <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="mr-2 size-4" />Créer un accès</Button>}
        </div>
      </div>

      <section className="space-y-2">
        <h4 className="font-medium">Demandes du client {open.length > 0 && <Badge className="ml-2">{open.length} à traiter</Badge>}</h4>
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 text-sm">
            <div className="space-y-1">
              <div><strong>{PORTAL_REQUEST_LABEL[r.kind] ?? r.kind}</strong> · {r.reference} · {new Date(r.created_at).toLocaleDateString("fr-FR")} · {r.requester_name}</div>
              {r.kind === "credit_limit" && r.amount != null && <div>Nouveau plafond demandé : <strong>{formatMoney(Number(r.amount))}</strong></div>}
              {r.card_id && <div>Carte : <span translate="no">{q.data?.cards.find((c) => c.id === r.card_id)?.card_number ?? "—"}</span></div>}
              <p className="text-muted-foreground">« {r.message} »</p>
              {r.status !== "open" && <p className="text-xs text-muted-foreground">{PORTAL_STATUS_LABEL[r.status]} par {r.decided_by_name ?? "—"} le {r.decided_at ? new Date(r.decided_at).toLocaleDateString("fr-FR") : "—"}{r.decision_comment ? ` — ${r.decision_comment}` : ""}</p>}
            </div>
            {r.status === "open" && canEdit ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => staff("decide", { request_id: r.id, decision: "accepted" }, r.kind === "credit_limit" ? "Plafond mis à jour" : "Demande acceptée")}>
                  <Check className="mr-1 size-4" />Accepter
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setDecline(r)}><X className="mr-1 size-4" />Refuser</Button>
              </div>
            ) : (
              <Badge variant={r.status === "accepted" ? "secondary" : r.status === "declined" ? "destructive" : "outline"}>{PORTAL_STATUS_LABEL[r.status]}</Badge>
            )}
          </div>
        ))}
        {!requests.length && <p className="py-3 text-sm text-muted-foreground">Aucune demande de ce client.</p>}
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">Comptes d'accès</h4>
        {users.map((u) => (
          <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
            <div>
              <div className="font-medium">{u.full_name}</div>
              <div className="text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2"><Switch checked={u.can_manage} disabled={!canEdit || busy} onCheckedChange={(v) => staff("update_user", { user_id: u.user_id, can_manage: v }, "Droits mis à jour")} />Peut gérer</label>
              <label className="flex items-center gap-2"><Switch checked={u.active} disabled={!canEdit || busy} onCheckedChange={(v) => staff("update_user", { user_id: u.user_id, active: v }, v ? "Accès réactivé" : "Accès suspendu")} />Actif</label>
            </div>
          </div>
        ))}
        {!users.length && <p className="py-3 text-sm text-muted-foreground">Aucun accès pour ce client.</p>}
      </section>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvel accès — {clientName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nom complet</Label><Input value={form.full_name} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1"><Label>Mot de passe (10 à 72 caractères)</Label><Input type="text" value={form.password} maxLength={72} autoComplete="new-password" onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
              <Switch checked={form.can_manage} onCheckedChange={(v) => setForm({ ...form, can_manage: v })} />
              <span><span className="font-medium">Peut gérer</span><br /><span className="text-muted-foreground">Bloquer une carte, gérer conducteurs et véhicules, faire des demandes. Sinon : consultation seule.</span></span>
            </label>
            <p className="text-xs text-muted-foreground"><KeyRound className="mr-1 inline size-3" />Ce compte ne voit que les données de {clientName}, jamais celles de la société.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Annuler</Button>
            <Button disabled={busy || !form.full_name || !form.email || !form.password} onClick={create}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Créer l'accès</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decline} onOpenChange={(o) => !o && setDecline(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser la demande {decline?.reference}</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>Motif (visible par le client)</Label><Textarea value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecline(null)}>Annuler</Button>
            <Button variant="destructive" disabled={busy || comment.trim().length < 3} onClick={() => decline && staff("decide", { request_id: decline.id, decision: "declined", comment }, "Demande refusée")}>Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
