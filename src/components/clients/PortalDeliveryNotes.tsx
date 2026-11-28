import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileDown, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DECISION_LABEL } from "@/components/pro/EcmrSignDialog";
import { BlSignDialog, VarianceBadge } from "@/components/logistics/BlParts";
import { blDecision, blQuantities, nextSignatureRole, signatureProgress, type BlRole, type DeliveryNote } from "@/lib/deliveryNotes";
import { exportDeliveryNote } from "@/lib/deliveryNoteExport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Client space: the client's delivery notes; the designated client user signs as consignee. */
export function PortalDeliveryNotes({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [sign, setSign] = useState<{ note: DeliveryNote; role: BlRole } | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await db.rpc("b2b_portal_delivery_notes");
    if (error) toast.error(error.message); else setNotes(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>N° BL</TableHead><TableHead>Date</TableHead><TableHead>Livraison</TableHead><TableHead className="text-right">Volume BL (L)</TableHead><TableHead className="text-right">Qté reçue (L)</TableHead><TableHead className="text-right">Écart chauffeur</TableHead><TableHead>Visas</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {!notes.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Aucun bon de livraison.</TableCell></TableRow>}
          {notes.map((n) => {
            const done = signatureProgress(n.signatures); const dec = blDecision(n.signatures);
            const mine = canManage && user ? nextSignatureRole(n, user.id) : null; const q = blQuantities(n);
            const waiting = n.consignee_user === user?.id && done < 3 && !mine;
            return (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs">{n.number}</TableCell>
                <TableCell>{new Date(n.created_at).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell className="text-xs">{n.snapshot.site}<br />{n.snapshot.truck}</TableCell>
                <TableCell className="text-right tabular-nums">{q.bl.toLocaleString("fr-FR")}</TableCell>
                <TableCell className="text-right tabular-nums">{q.received === null ? "—" : Math.round(q.received).toLocaleString("fr-FR")}</TableCell>
                <TableCell className="text-right"><VarianceBadge v={q.variance} /></TableCell>
                <TableCell><Badge variant={dec === "refused" ? "destructive" : done === 3 ? "outline" : "secondary"}>{done}/3{done === 3 ? ` · ${DECISION_LABEL[dec]}` : waiting ? " · en attente" : ""}</Badge></TableCell>
                <TableCell className="flex gap-1">
                  {mine && <Button size="sm" onClick={() => setSign({ note: n, role: mine })}><PenLine className="mr-1 h-4 w-4" />{mine === "carrier" ? "Faire signer le chauffeur" : "Signer la réception"}</Button>}
                  <Button size="sm" variant="ghost" title="PDF" onClick={() => exportDeliveryNote(n).catch((e) => toast.error(String(e)))}><FileDown className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <BlSignDialog sign={sign} onClose={() => setSign(null)} onDone={load} />
    </CardContent></Card>
  );
}
