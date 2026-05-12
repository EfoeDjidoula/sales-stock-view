import { useMemo, useState } from "react";
import { useStations } from "@/hooks/useStations";
import { useTanks, type Tank } from "@/hooks/useTanks";
import { usePumps, type Pump } from "@/hooks/usePumps";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Droplets, Fuel, Loader2, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TankDialog } from "./TankDialog";
import { PumpDialog } from "./PumpDialog";

interface StationConfigModuleProps {
  isAdmin: boolean;
}

export const StationConfigModule = ({ isAdmin }: StationConfigModuleProps) => {
  const { stations, loading: stationsLoading } = useStations();
  const [stationId, setStationId] = useState<string>("");

  const effectiveStationId = stationId || stations[0]?.id || "";

  const { tanks, loading: tanksLoading, refetch: refetchTanks } = useTanks(effectiveStationId || undefined);
  const { pumps, loading: pumpsLoading, refetch: refetchPumps } = usePumps(effectiveStationId || undefined);

  const [tankDialog, setTankDialog] = useState<{ open: boolean; tank: Tank | null }>({ open: false, tank: null });
  const [pumpDialog, setPumpDialog] = useState<{ open: boolean; pump: Pump | null }>({ open: false, pump: null });
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "tank" | "pump"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const tanksById = useMemo(() => new Map(tanks.map((t) => [t.id, t])), [tanks]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from(deleteTarget.kind === "tank" ? "tanks" : "pumps").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(deleteTarget.kind === "tank" ? "Cuve supprimée" : "Pompe supprimée");
      if (deleteTarget.kind === "tank") {
        await refetchTanks();
        await refetchPumps(); // tank_id devient NULL via FK
      } else {
        await refetchPumps();
      }
      setDeleteTarget(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  if (stationsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Créez d'abord une station pour configurer ses cuves et pompes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Configuration des cuves & pompes</h2>
          <p className="text-sm text-muted-foreground">Capacités réelles, pompes, et liaisons par station.</p>
        </div>
        <div className="w-full sm:w-72">
          <Select value={effectiveStationId} onValueChange={setStationId}>
            <SelectTrigger><SelectValue placeholder="Choisir une station" /></SelectTrigger>
            <SelectContent>
              {stations.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tanks */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-primary" />
              <h3 className="font-display font-semibold">Cuves ({tanks.length})</h3>
            </div>
            {isAdmin && (
              <Button size="sm" className="gap-2" onClick={() => setTankDialog({ open: true, tank: null })}>
                <Plus className="w-4 h-4" /> Ajouter
              </Button>
            )}
          </div>
          {tanksLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : tanks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune cuve. Ajoutez la première.</p>
          ) : (
            <ul className="space-y-2">
              {tanks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.name}</span>
                      <Badge variant={t.product_type === "super" ? "default" : "secondary"} className="text-[10px] uppercase">
                        {t.product_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Capacité : <span className="font-semibold text-foreground">{t.capacity_liters.toLocaleString("fr-FR")} L</span>
                      {t.notes && <span className="ml-2">• {t.notes}</span>}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setTankDialog({ open: true, tank: t })}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget({ kind: "tank", id: t.id, name: t.name })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pumps */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              <h3 className="font-display font-semibold">Pompes ({pumps.length})</h3>
            </div>
            {isAdmin && (
              <Button size="sm" className="gap-2" onClick={() => setPumpDialog({ open: true, pump: null })}>
                <Plus className="w-4 h-4" /> Ajouter
              </Button>
            )}
          </div>
          {pumpsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : pumps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucune pompe. Ajoutez la première.</p>
          ) : (
            <ul className="space-y-2">
              {pumps.map((p) => {
                const linkedTank = p.tank_id ? tanksById.get(p.tank_id) : null;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{p.name}</span>
                        <Badge variant={p.product_type === "super" ? "default" : "secondary"} className="text-[10px] uppercase">
                          {p.product_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        {linkedTank ? (
                          <>
                            <Link2 className="w-3 h-3 text-primary" />
                            Liée à <span className="font-semibold text-foreground">{linkedTank.name}</span>
                          </>
                        ) : (
                          <>
                            <Link2Off className="w-3 h-3 text-destructive" />
                            <span className="text-destructive">Non liée à une cuve</span>
                          </>
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setPumpDialog({ open: true, pump: p })}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ kind: "pump", id: p.id, name: p.name })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {effectiveStationId && (
        <>
          <TankDialog
            open={tankDialog.open}
            onOpenChange={(o) => setTankDialog({ open: o, tank: o ? tankDialog.tank : null })}
            stationId={effectiveStationId}
            tank={tankDialog.tank}
            onSaved={refetchTanks}
          />
          <PumpDialog
            open={pumpDialog.open}
            onOpenChange={(o) => setPumpDialog({ open: o, pump: o ? pumpDialog.pump : null })}
            stationId={effectiveStationId}
            pump={pumpDialog.pump}
            tanks={tanks}
            onSaved={refetchPumps}
          />
        </>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer <strong>{deleteTarget?.name}</strong> ? Cette action est irréversible.
              {deleteTarget?.kind === "tank" && " Les pompes liées seront détachées."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
