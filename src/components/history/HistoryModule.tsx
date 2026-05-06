import { useState, useMemo } from "react";
import { useIndexEntries, type IndexEntry } from "@/hooks/useIndexEntries";
import { useStations } from "@/hooks/useIndexEntries";
import { formatCurrency } from "@/data/stationsData";
import { FUEL_PRICES } from "@/config/prices";
import { EditEntryDialog } from "./EditEntryDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const HistoryModule = () => {
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [editEntry, setEditEntry] = useState<IndexEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<IndexEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;
  const stationId = stationFilter === "all" ? undefined : stationFilter;

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    const { error } = await supabase.from("index_entries").delete().eq("id", deleteEntry.id);
    setDeleting(false);
    if (error) {
      toast.error("Erreur lors de la suppression", { description: error.message });
      return;
    }
    toast.success("Saisie supprimée");
    queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-entries"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
    queryClient.invalidateQueries({ queryKey: ["latest-jauge"] });
    queryClient.invalidateQueries({ queryKey: ["stock-jauges"] });
    setDeleteEntry(null);
  };

  const { data: entries, isLoading } = useIndexEntries(stationId, startStr, endStr);
  const { data: stations } = useStations();

  const computeLiters = (entry: IndexEntry) => {
    const s1 = Math.max(0, entry.super1_index_arrivee - entry.super1_index_depart);
    const s2 = Math.max(0, entry.super2_index_arrivee - entry.super2_index_depart);
    const g1 = Math.max(0, entry.gasoil1_index_arrivee - entry.gasoil1_index_depart);
    const g2 = Math.max(0, entry.gasoil2_index_arrivee - entry.gasoil2_index_depart);
    return { superL: s1 + s2, gasoilL: g1 + g2 };
  };

  const computeVersements = (entry: IndexEntry) => {
    return Math.max(0, entry.versement_momo) + Math.max(0, entry.versement_banque) + Math.max(0, entry.versement_liquidite);
  };

  const totals = useMemo(() => {
    if (!entries) return { superL: 0, gasoilL: 0, amount: 0, versements: 0 };
    return entries.reduce((acc, e) => {
      const { superL, gasoilL } = computeLiters(e);
      acc.superL += superL;
      acc.gasoilL += gasoilL;
      acc.amount += superL * FUEL_PRICES.SUPER + gasoilL * FUEL_PRICES.GASOIL;
      acc.versements += computeVersements(e);
      return acc;
    }, { superL: 0, gasoilL: 0, amount: 0, versements: 0 });
  }, [entries]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Station filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Station</label>
              <Select value={stationFilter} onValueChange={setStationFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Toutes les stations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les stations</SelectItem>
                  {stations?.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date début</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Début"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* End date */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date fin</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Fin"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Reset */}
            {(stationFilter !== "all" || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setStationFilter("all"); setStartDate(undefined); setEndDate(undefined); }}>
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Super (L)</p>
          <p className="text-lg font-bold">{totals.superL.toLocaleString("fr-FR")}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Gasoil (L)</p>
          <p className="text-lg font-bold">{totals.gasoilL.toLocaleString("fr-FR")}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Montant total</p>
          <p className="text-lg font-bold">{formatCurrency(totals.amount)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Versements</p>
          <p className="text-lg font-bold">{formatCurrency(totals.versements)}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !entries?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              Aucune saisie trouvée pour les filtres sélectionnés.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Super (L)</TableHead>
                    <TableHead className="text-right">Gasoil (L)</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Versements</TableHead>
                    <TableHead className="text-right">Bons</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(entry => {
                    const { superL, gasoilL } = computeLiters(entry);
                    const amount = superL * FUEL_PRICES.SUPER + gasoilL * FUEL_PRICES.GASOIL;
                    const versements = computeVersements(entry);
                    const bons = entry.bons_carburant_valeur + entry.bons_entreprise_valeur;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(entry.entry_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="font-medium">{entry.stations?.name || "—"}</TableCell>
                        <TableCell className="text-right">{superL.toLocaleString("fr-FR")}</TableCell>
                        <TableCell className="text-right">{gasoilL.toLocaleString("fr-FR")}</TableCell>
                        <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(versements)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(bons)}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" onClick={() => setEditEntry(entry)} title="Modifier">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteEntry(entry)} title="Supprimer" className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditEntryDialog entry={editEntry} open={!!editEntry} onOpenChange={open => { if (!open) setEditEntry(null); }} />
    </div>
  );
};
