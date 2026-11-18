import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, AlertTriangle, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OFFLINE_EVENT, offlineOps, replayOfflineOps, type OfflineOp } from "@/lib/offlineQueue";
import "@/lib/offlineHandlers";

/**
 * Network indicator + automatic sending of entries kept on the device.
 * Hidden when online with nothing pending.
 */
export const OfflineStatus = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [items, setItems] = useState<OfflineOp[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setItems(user ? offlineOps.list(user.id) : []), [user]);

  const sync = useCallback(async () => {
    if (!user || !navigator.onLine || !offlineOps.list(user.id).length) return;
    setSyncing(true);
    const { sent, failed } = await replayOfflineOps(user.id);
    setSyncing(false);
    refresh();
    if (sent) {
      toast.success(sent > 1 ? `${sent} saisies envoyées` : "1 saisie envoyée", { description: "Les saisies faites sans réseau sont maintenant enregistrées." });
      queryClient.invalidateQueries();
    }
    if (failed) toast.error(failed > 1 ? `${failed} saisies refusées` : "1 saisie refusée", { description: "Ouvrez l'indicateur en bas de l'écran pour voir le motif." });
  }, [user, refresh, queryClient]);

  useEffect(() => {
    refresh();
    const on = () => { setOnline(true); void sync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(OFFLINE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    void sync();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(OFFLINE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh, sync]);

  if (!user || (online && items.length === 0)) return null;
  const errors = items.filter((i) => i.error).length;

  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur ${
              !online ? "border-warning/40 bg-warning/15 text-warning" : errors ? "border-destructive/40 bg-destructive/15 text-destructive" : "border-primary/40 bg-card/90 text-foreground"
            }`}
          >
            {!online ? <CloudOff className="h-4 w-4" /> : errors ? <AlertTriangle className="h-4 w-4" /> : <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />}
            {!online ? "Hors ligne" : "En ligne"}
            {items.length > 0 && <span className="tabular-nums">· {items.length} en attente d'envoi</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <div className="text-sm font-semibold">{online ? "Saisies à envoyer" : "Vous êtes hors ligne"}</div>
          <p className="text-xs text-muted-foreground">
            {online
              ? "Les saisies faites sans réseau partent automatiquement. Elles passent par les mêmes contrôles que d'habitude."
              : "Vous pouvez consulter les écrans déjà ouverts, saisir les index et enregistrer une réception. Tout sera envoyé au retour du réseau."}
          </p>
          {items.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" />Aucune saisie en attente.</div>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-auto">
              {items.map((i) => (
                <li key={i.id} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{i.label}</span>
                    <span className="text-muted-foreground">{new Date(i.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  {i.error && (
                    <div className="mt-1 flex items-start justify-between gap-2 text-destructive">
                      <span>Refusée : {i.error}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label="Retirer cette saisie" onClick={() => offlineOps.remove(i.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {online && items.length > 0 && (
            <Button size="sm" className="w-full" disabled={syncing} onClick={() => void sync()}>
              <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Envoyer maintenant
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
