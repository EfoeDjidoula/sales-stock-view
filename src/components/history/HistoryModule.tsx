import { useState, useMemo } from "react";
import { useIndexEntries, type IndexEntry } from "@/hooks/useIndexEntries";
import { useStations } from "@/hooks/useIndexEntries";
import { formatCurrency } from "@/data/stationsData";
import { FUEL_PRICES } from "@/config/prices";
import { EditEntryDialog } from "./EditEntryDialog";
import { sortNozzles } from "@/lib/nozzleOrder";
import { IndexValidationDialog } from "./IndexValidationDialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon, Search, Pencil, Trash2, Loader2, ShieldCheck, ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useAuth } from "@/hooks/useAuth";
import { Fragment } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useLanguage } from "@/hooks/useLanguage";

export const HistoryModule = () => {
  const { language, t } = useLanguage();
  const locale = language === "en" ? "en-US" : "fr-FR";
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [editEntry, setEditEntry] = useState<IndexEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<IndexEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { user } = useAuth();
  const canValidate = isPlatformAdmin || can("index_entries", "validate");
  const [decisionEntry, setDecisionEntry] = useState<IndexEntry | null>(null);
  const [recapEntry, setRecapEntry] = useState<IndexEntry | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pumpDetail, setPumpDetail] = useState<Record<string, any[]>>({});

  const toggleDetail = async (id: string) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!pumpDetail[id]) {
      const { data } = await (supabase as any).from("pump_index_entries")
        .select("pump_id, product_type, index_depart, index_arrivee, retour_cuve, liters_net, pumps(name)").eq("entry_id", id);
      setPumpDetail((m) => ({ ...m, [id]: (data ?? []).sort((a: any, b: any) => (a.product_type === b.product_type ? String(a.pumps?.name).localeCompare(String(b.pumps?.name)) : a.product_type === "super" ? -1 : 1)) }));
    }
  };


  const startStr = startDate ? format(startDate, "yyyy-MM-dd") : undefined;
  const endStr = endDate ? format(endDate, "yyyy-MM-dd") : undefined;
  const stationId = stationFilter === "all" ? undefined : stationFilter;

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    const { error } = await supabase.from("index_entries").delete().eq("id", deleteEntry.id);
    setDeleting(false);
    if (error) {
       toast.error(t("Erreur lors de la suppression"), { description: error.message });
      return;
    }
     toast.success(t("Saisie supprimée"));
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["indexEntries"], type: "all" }),
        queryClient.refetchQueries({ queryKey: ["dashboard-entries"], type: "all" }),
        queryClient.refetchQueries({ queryKey: ["dashboard-chart"], type: "all" }),
        queryClient.refetchQueries({ queryKey: ["latest-jauge"], type: "all" }),
        queryClient.refetchQueries({ queryKey: ["stock-jauges"], type: "all" }),
        queryClient.refetchQueries({ queryKey: ["previous-entry"], type: "all" }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
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
             {t("Filtres")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            {/* Station filter */}
            <div className="space-y-1">
               <label className="text-xs font-medium text-muted-foreground">{t("Station")}</label>
              <Select value={stationFilter} onValueChange={setStationFilter}>
                <SelectTrigger className="w-[200px]">
                   <SelectValue placeholder={t("Toutes les stations")} />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="all">{t("Toutes les stations")}</SelectItem>
                  {stations?.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start date */}
            <div className="space-y-1">
               <label className="text-xs font-medium text-muted-foreground">{t("Date début")}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                     {startDate ? format(startDate, "dd/MM/yyyy") : t("Début")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* End date */}
            <div className="space-y-1">
               <label className="text-xs font-medium text-muted-foreground">{t("Date fin")}</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                     {endDate ? format(endDate, "dd/MM/yyyy") : t("Fin")}
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
                 {t("Réinitialiser")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
           <p className="text-xs text-muted-foreground">Super (L)</p>
          {isLoading || isRefreshing ? (
            <Skeleton className="h-7 w-24 mt-1" />
          ) : (
             <p className="text-lg font-bold">{totals.superL.toLocaleString(locale)}</p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Gasoil (L)</p>
          {isLoading || isRefreshing ? (
            <Skeleton className="h-7 w-24 mt-1" />
          ) : (
             <p className="text-lg font-bold">{totals.gasoilL.toLocaleString(locale)}</p>
          )}
        </Card>
        <Card className="p-3">
           <p className="text-xs text-muted-foreground">{t("Montant total")}</p>
          {isLoading || isRefreshing ? (
            <Skeleton className="h-7 w-28 mt-1" />
          ) : (
            <p className="text-lg font-bold">{formatCurrency(totals.amount)}</p>
          )}
        </Card>
        <Card className="p-3">
           <p className="text-xs text-muted-foreground">{t("Versements")}</p>
          {isLoading || isRefreshing ? (
            <Skeleton className="h-7 w-28 mt-1" />
          ) : (
            <p className="text-lg font-bold">{formatCurrency(totals.versements)}</p>
          )}
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading || isRefreshing ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Super (L)</TableHead>
                    <TableHead className="text-right">Gasoil (L)</TableHead>
                     <TableHead className="text-right">{t("Montant")}</TableHead>
                     <TableHead className="text-right">{t("Versements")}</TableHead>
                     <TableHead className="text-right">{t("Bons")}</TableHead>
                     <TableHead>Statut</TableHead>
                     <TableHead className="text-center">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell />
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-8 w-16 mx-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : !entries?.length ? (
            <div className="text-center py-12 text-muted-foreground">
               {t("Aucune saisie trouvée pour les filtres sélectionnés.")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Date</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead className="text-right">Super (L)</TableHead>
                    <TableHead className="text-right">Gasoil (L)</TableHead>
                     <TableHead className="text-right">{t("Montant")}</TableHead>
                     <TableHead className="text-right">{t("Versements")}</TableHead>
                     <TableHead className="text-right">{t("Bons")}</TableHead>
                     <TableHead>Statut</TableHead>
                     <TableHead className="text-center">{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(entry => {
                    const legacy = computeLiters(entry);
                    const superL = entry.total_super_liters ?? legacy.superL;
                    const gasoilL = entry.total_gasoil_liters ?? legacy.gasoilL;
                    const amount = entry.vente_globale ?? superL * FUEL_PRICES.SUPER + gasoilL * FUEL_PRICES.GASOIL;
                    const validated = entry.status === "valide";
                    const rejected = entry.status === "rejete";
                    const versements = computeVersements(entry);
                    const bons = Number((entry as any).bons_clients_montant) || (entry.bons_carburant_valeur + entry.bons_entreprise_valeur);
                    return (
                      <Fragment key={entry.id}>
                      <TableRow>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleDetail(entry.id)} title="Détail par pistolet">
                            {expanded === entry.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                           {new Date(entry.entry_date).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="font-medium">{entry.stations?.name || "—"}</TableCell>
                         <TableCell className="text-right">{superL.toLocaleString(locale)}</TableCell>
                         <TableCell className="text-right">{gasoilL.toLocaleString(locale)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(versements)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(bons)}</TableCell>
                        <TableCell>
                          {validated ? (
                            <Badge variant="outline" className="border-success/40 text-success whitespace-nowrap" title={entry.validated_by_name ? `Validé par ${entry.validated_by_name}` : undefined}>Validé N+1</Badge>
                          ) : rejected ? (
                            <Badge variant="outline" className="border-destructive/40 text-destructive whitespace-nowrap" title={entry.rejection_reason ?? undefined}>Rejeté N+1</Badge>
                          ) : (
                            <Badge variant="outline" className="border-warning/40 text-warning whitespace-nowrap">Pré-enregistré</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => setRecapEntry(entry)} title="Récap PDF">
                            <FileDown className="w-4 h-4" />
                          </Button>
                          {!validated && !rejected && canValidate && (isPlatformAdmin || entry.user_id !== user?.id) && (
                            <Button variant="ghost" size="icon" onClick={() => setDecisionEntry(entry)} title="Valider ou rejeter (N+1)" className="text-success">
                              <ShieldCheck className="w-4 h-4" />
                            </Button>
                          )}
                          {!validated && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => setEditEntry(entry)} title={t("Modifier")}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteEntry(entry)} title={t("Supprimer")} className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {expanded === entry.id && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-muted/30">
                            {!pumpDetail[entry.id] ? <Skeleton className="h-6 w-full" /> : pumpDetail[entry.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground">Ancien format : pas de détail par pistolet.</p>
                            ) : (
                              <div className="grid gap-1 text-xs sm:grid-cols-2">
                                {sortNozzles(pumpDetail[entry.id].map((r: any) => ({ ...r, name: r.pumps?.name ?? "" }))).map((r: any) => (
                                  <div key={r.pump_id} className="flex justify-between gap-3 rounded border border-border/50 px-2 py-1 tabular-nums">
                                    <span className="font-medium">{r.pumps?.name ?? "—"} <span className="text-muted-foreground uppercase">{r.product_type}</span></span>
                                    <span>{Number(r.index_depart).toLocaleString(locale)} → {Number(r.index_arrivee).toLocaleString(locale)} · retour {Number(r.retour_cuve || 0).toLocaleString(locale)} · net <strong>{Number(r.liters_net ?? 0).toLocaleString(locale)} L</strong></span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {(() => {
                              const e = entry as any; const n = (v: unknown) => Number(v) || 0;
                              const vente = n(e.vente_globale);
                              const ded = n(e.autoconso_montant) + n(e.bons_clients_montant) + n(e.tickets_valeur_montant) + n(e.cartes_montant) + n(e.versement_momo);
                              const aVerser = e.montant_a_verser ?? vente - ded;
                              const verse = n(e.versement_banque) + n(e.versement_liquidite);
                              const items: [string, number][] = [["Vente brute", vente], ["Autoconso", n(e.autoconso_montant)], ["Bons clients", n(e.bons_clients_montant)], ["Tickets valeur", n(e.tickets_valeur_montant)], ["Cartes", n(e.cartes_montant)], ["Mobile Money", n(e.versement_momo)], ["Net à verser", aVerser], [`Versé banque${e.versement_banque_ref ? ` (BV ${e.versement_banque_ref})` : ""}`, verse], ["Écart versement", verse - aVerser]];
                              return (
                                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
                                  {items.map(([l, v]) => (
                                    <div key={l} className="flex justify-between gap-2 rounded border border-border/50 px-2 py-1 tabular-nums"><span className="text-muted-foreground">{l}</span><strong>{formatCurrency(v)}</strong></div>
                                  ))}
                                </div>
                              );
                            })()}
                            {rejected && (
                              <p className="mt-2 text-xs text-destructive">
                                Rejetée par {entry.rejected_by_name ?? "le N+1"}{entry.rejected_at ? ` le ${new Date(entry.rejected_at).toLocaleDateString(locale)}` : ""} : {entry.rejection_reason}
                              </p>
                            )}
                            {validated && entry.closure_id && <p className="mt-2 text-xs text-success">Clôture du jour générée dans « Ventes & Clôtures ».</p>}
                            {!!entry.sync_warnings?.length && <p className="mt-2 text-xs text-warning">{entry.sync_warnings.join(" · ")}</p>}
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <IndexValidationDialog entry={decisionEntry} open={!!decisionEntry} onOpenChange={(o) => { if (!o) setDecisionEntry(null); }} />

      <IndexValidationDialog readOnly entry={recapEntry} open={!!recapEntry} onOpenChange={(o) => { if (!o) setRecapEntry(null); }} />

      <EditEntryDialog entry={editEntry} open={!!editEntry} onOpenChange={open => { if (!open) setEditEntry(null); }} />

      <AlertDialog open={!!deleteEntry} onOpenChange={open => { if (!open && !deleting) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
             <AlertDialogTitle>{t("Supprimer cette saisie ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry && (
                <>
                   {t("Vous êtes sur le point de supprimer la saisie du")}{" "}
                   <strong>{new Date(deleteEntry.entry_date).toLocaleDateString(locale)}</strong>{" "}
                   {t("pour la station")} <strong>{deleteEntry.stations?.name}</strong>{t(". Cette action est irréversible.")}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel disabled={deleting}>{t("Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("Suppression...")}</> : t("Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
