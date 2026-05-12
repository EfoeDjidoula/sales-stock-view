import { useState } from "react";
import { useStations } from "@/hooks/useStations";
import { useDashboardData, Period } from "@/hooks/useDashboardData";
import { useStationAssignments } from "@/hooks/useStationAssignments";
import { useUserRoles } from "@/hooks/useUserRoles";
import { PeriodTabs } from "@/components/dashboard/PeriodTabs";
import { StationAssignmentDialog } from "@/components/stations/StationAssignmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin, Fuel, Loader2, TrendingUp, Droplets, Search, ArrowUpDown, Users, Settings2, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StationConfigModule } from "@/components/stations/StationConfigModule";
import { formatCurrency } from "@/data/stationsData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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

interface StationFormData {
  name: string;
  location: string;
}

interface StationManagementProps {
  isAdmin: boolean;
}

export const StationManagement = ({ isAdmin }: StationManagementProps) => {
  const { stations, loading, refetch } = useStations();
  const [period, setPeriod] = useState<Period>("day");
  const { salesByStation } = useDashboardData(period);
  const { assignments, assignUser, unassignUser, getAssignedUsers } = useStationAssignments();
  const { users } = useUserRoles();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "sales">("name");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignStation, setAssignStation] = useState<{ id: string; name: string } | null>(null);
  const [editingStation, setEditingStation] = useState<{ id: string; name: string; location: string } | null>(null);
  const [deletingStation, setDeletingStation] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState<StationFormData>({ name: "", location: "" });
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({ name: "", location: "" });
    setEditingStation(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (station: { id: string; name: string; location: string }) => {
    setEditingStation(station);
    setFormData({ name: station.name, location: station.location });
    setDialogOpen(true);
  };

  const openDeleteDialog = (station: { id: string; name: string }) => {
    setDeletingStation(station);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    const name = formData.name.trim();
    const location = formData.location.trim();

    if (!name || !location) {
      toast.error("Veuillez remplir tous les champs.");
      return;
    }
    if (name.length > 100 || location.length > 200) {
      toast.error("Nom (max 100) ou localisation (max 200) trop long.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingStation) {
        const { error } = await supabase
          .from("stations")
          .update({ name, location })
          .eq("id", editingStation.id);
        if (error) throw error;
        toast.success("Station modifiée avec succès");
      } else {
        const { error } = await supabase
          .from("stations")
          .insert({ name, location });
        if (error) throw error;
        toast.success("Station ajoutée avec succès");
      }
      setDialogOpen(false);
      resetForm();
      await refetch();
    } catch (error: any) {
      console.error(error);
      toast.error(editingStation ? "Erreur lors de la modification" : "Erreur lors de l'ajout");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingStation) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("stations")
        .delete()
        .eq("id", deletingStation.id);
      if (error) throw error;
      toast.success("Station supprimée avec succès");
      setDeleteDialogOpen(false);
      setDeletingStation(null);
      await refetch();
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de la suppression. La station est peut-être liée à des données existantes.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-display font-semibold">
          Gestion des stations ({stations.length})
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une station..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[220px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSortBy(sortBy === "name" ? "sales" : "name")}
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortBy === "name" ? "Nom" : "Ventes ↓"}
          </Button>
          <PeriodTabs selected={period} onSelect={setPeriod} />
          {isAdmin && (
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Ajouter une station
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations
          .filter((s) => {
            const q = searchQuery.toLowerCase();
            return !q || s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
          })
          .sort((a, b) => {
            if (sortBy === "sales") {
              const salesA = salesByStation.get(a.id)?.total || 0;
              const salesB = salesByStation.get(b.id)?.total || 0;
              return salesB - salesA;
            }
            return a.name.localeCompare(b.name, "fr");
          })
          .map((station) => {
          const stationSales = salesByStation.get(station.id);
          const totalSales = stationSales?.total || 0;
          const superJauge = stationSales?.superJauge || 0;
          const gasoilJauge = stationSales?.gasoilJauge || 0;

          return (
            <div
              key={station.id}
              className="bg-card rounded-xl border border-border p-5 transition-all duration-300 hover:border-primary/30"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-lg">{station.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {station.location}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-primary/10">
                  <Fuel className="w-5 h-5 text-primary" />
                </div>
              </div>

              {/* Sales & Stock Data */}
              <div className="space-y-3 mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Ventes {period === "day" ? "du jour" : period === "week" ? "de la semaine" : "du mois"}
                    </p>
                    <p className="text-lg font-display font-bold text-gradient">
                      {formatCurrency(totalSales)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-secondary/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Droplets className="w-3 h-3 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Super</span>
                    </div>
                    <p className="text-sm font-semibold">{superJauge.toFixed(0)} L</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Droplets className="w-3 h-3 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">Gasoil</span>
                    </div>
                    <p className="text-sm font-semibold">{gasoilJauge.toFixed(0)} L</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-1">
                Créée le {new Date(station.created_at).toLocaleDateString("fr-FR")}
              </p>

              {/* Assigned users badges */}
              {(() => {
                const assigned = getAssignedUsers(station.id);
                if (assigned.length === 0) return (
                  <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/20">
                    <Users className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-medium text-destructive">Aucun opérateur assigné</span>
                  </div>
                );
                return (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {assigned.map((a) => {
                      const u = users.find((u) => u.id === a.user_id);
                      return (
                        <Badge key={a.id} variant="secondary" className="text-xs">
                          {u?.full_name || a.user_id.slice(0, 8)}
                        </Badge>
                      );
                    })}
                  </div>
                );
              })()}

              {isAdmin && (
                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setAssignStation({ id: station.id, name: station.name });
                      setAssignDialogOpen(true);
                    }}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Assigner
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 flex-1"
                    onClick={() => openEditDialog(station)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => openDeleteDialog(station)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setDialogOpen(open); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingStation ? "Modifier la station" : "Ajouter une station"}</DialogTitle>
            <DialogDescription>
              {editingStation ? "Modifiez les informations de la station." : "Renseignez les informations de la nouvelle station."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="station-name">Nom de la station</Label>
              <Input
                id="station-name"
                placeholder="Ex: Station Cotonou Nord"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="station-location">Localisation</Label>
              <Input
                id="station-location"
                placeholder="Ex: Cotonou, Bénin"
                value={formData.location}
                onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingStation ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la station</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer la station <strong>{deletingStation?.name}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Dialog */}
      {assignStation && (
        <StationAssignmentDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          stationName={assignStation.name}
          stationId={assignStation.id}
          assignedUsers={getAssignedUsers(assignStation.id)}
          allUsers={users}
          onAssign={assignUser}
          onUnassign={unassignUser}
        />
      )}
    </div>
  );
};
