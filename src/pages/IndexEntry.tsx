import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatNumber } from "@/data/stationsData";
import { useStations, useSaveIndexEntry, type PumpEntryInput } from "@/hooks/useIndexEntries";
import { useFiscalYears } from "@/hooks/useFiscalYears";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { ProfileMenu } from "@/components/ProfileMenu";
import { DbStationSelector } from "@/components/dashboard/DbStationSelector";
import { usePumps } from "@/hooks/usePumps";
import { useTanks } from "@/hooks/useTanks";
import { usePumpIndexEntries, usePreviousPumpIndex } from "@/hooks/usePumpIndexEntries";
import { DynamicPumpEntry, type PumpRow, type TankJauge } from "@/components/index-entry/DynamicPumpEntry";
import {
  Fuel,
  Calendar,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Banknote,
  Smartphone,
  Building2,
  Lock,
  Receipt,
  FileDown,
  ClipboardCheck,
  X,
} from "lucide-react";
import { FUEL_PRICES } from "@/config/prices";
import { usePdfExport } from "@/hooks/usePdfExport";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

// Schema for a single product entry
const productEntrySchema = z.object({
  indexArrivee: z
    .string()
    .min(1, "Index requis")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Doit être un nombre positif",
    }),
  indexDepart: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
  jaugeDuJour: z
    .string()
    .min(1, "Jauge requise")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Doit être un nombre positif",
    }),
});

// Versement schema
const versementSchema = z.object({
  montant: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
  reference: z.string().optional(),
});

// Bon de valeur schema
const bonSchema = z.object({
  nombre: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseInt(val)) && parseInt(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
  valeurUnitaire: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
});

// Main form schema
const indexEntrySchema = z.object({
  date: z.string().min(1, "Date requise"),
  super1: productEntrySchema,
  super2: productEntrySchema,
  gasoil1: productEntrySchema,
  gasoil2: productEntrySchema,
  // Versements
  versementMomo: versementSchema,
  versementBanque: versementSchema,
  versementLiquidite: versementSchema,
  // Bons de valeur
  bonsCarburant: bonSchema,
  bonsEntreprise: bonSchema,
});

type IndexEntryForm = z.infer<typeof indexEntrySchema>;

const defaultValues: IndexEntryForm = {
  date: new Date().toISOString().split("T")[0],
  super1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  super2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  versementMomo: { montant: "", reference: "" },
  versementBanque: { montant: "", reference: "" },
  versementLiquidite: { montant: "", reference: "" },
  bonsCarburant: { nombre: "", valeurUnitaire: "" },
  bonsEntreprise: { nombre: "", valeurUnitaire: "" },
};

const IndexEntry = () => {
  const { data: dbStations } = useStations();
  const { fiscalYears } = useFiscalYears();
  const { user } = useAuth();
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; location: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState<{
    stationName: string;
    date: string;
    superLiters: number;
    gasoilLiters: number;
    superAmount: number;
    gasoilAmount: number;
    momo: number;
    banque: number;
    liquidite: number;
    totalVersements: number;
    bonsCarburant: number;
    bonsEntreprise: number;
    totalBons: number;
  } | null>(null);
  const { exportPdf } = usePdfExport();
  const saveIndexEntry = useSaveIndexEntry();

  // Set first station as default when stations load
  useEffect(() => {
    if (dbStations && dbStations.length > 0 && !selectedStation) {
      setSelectedStation(dbStations[0]);
    }
  }, [dbStations, selectedStation]);

  // --- Dynamic pump/tank configuration ---
  const { pumps } = usePumps(selectedStation?.id);
  const { tanks } = useTanks(selectedStation?.id);
  const hasDynamicConfig = pumps.length > 0;

  const [pumpRows, setPumpRows] = useState<Record<string, PumpRow>>({});
  const [tankJauges, setTankJauges] = useState<Record<string, TankJauge>>({});

  // Initialize empty rows whenever pumps/tanks change
  useEffect(() => {
    setPumpRows((prev) => {
      const next: Record<string, PumpRow> = {};
      for (const p of pumps) {
        next[p.id] = prev[p.id] || {
          pumpId: p.id,
          tankId: p.tank_id,
          productType: p.product_type,
          indexDepart: "",
          indexArrivee: "",
        };
        // Keep tank/product in sync with config
        next[p.id].tankId = p.tank_id;
        next[p.id].productType = p.product_type;
      }
      return next;
    });
    setTankJauges((prev) => {
      const next: Record<string, TankJauge> = {};
      for (const t of tanks) {
        next[t.id] = prev[t.id] || {
          tankId: t.id,
          productType: t.product_type,
          jauge: "",
        };
      }
      return next;
    });
  }, [pumps, tanks]);

  const form = useForm<IndexEntryForm>({
    resolver: zodResolver(indexEntrySchema),
    defaultValues,
  });

  // Check if the selected date's fiscal year is closed
  const selectedDate = form.watch("date");
  const fiscalYearStatus = useMemo(() => {
    if (!selectedDate || !fiscalYears.length) return null;
    const year = new Date(selectedDate).getFullYear();
    const fy = fiscalYears.find((f) => f.year === year);
    if (!fy) return null;
    return fy;
  }, [selectedDate, fiscalYears]);

  const isFiscalYearClosed = fiscalYearStatus?.status === "closed";

  // Fetch previous entry to auto-fill index départ
  const { data: previousEntry } = useQuery({
    queryKey: ["previous-entry", selectedStation?.id, selectedDate],
    queryFn: async () => {
      if (!selectedStation?.id || !selectedDate) return null;
      const { data, error } = await supabase
        .from("index_entries")
        .select("super1_index_arrivee, super2_index_arrivee, gasoil1_index_arrivee, gasoil2_index_arrivee, entry_date")
        .eq("station_id", selectedStation.id)
        .lt("entry_date", selectedDate)
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedStation?.id && !!selectedDate && !!user,
  });

  // Auto-fill index départ from previous entry's index arrivée
  useEffect(() => {
    if (previousEntry) {
      form.setValue("super1.indexDepart", String(previousEntry.super1_index_arrivee ?? 0));
      form.setValue("super2.indexDepart", String(previousEntry.super2_index_arrivee ?? 0));
      form.setValue("gasoil1.indexDepart", String(previousEntry.gasoil1_index_arrivee ?? 0));
      form.setValue("gasoil2.indexDepart", String(previousEntry.gasoil2_index_arrivee ?? 0));
    } else {
      form.setValue("super1.indexDepart", "");
      form.setValue("super2.indexDepart", "");
      form.setValue("gasoil1.indexDepart", "");
      form.setValue("gasoil2.indexDepart", "");
    }
  }, [previousEntry, form]);

  const hasPreviousEntry = !!previousEntry;

  const onSubmit = async (data: IndexEntryForm) => {
    if (!selectedStation) {
      toast.error("Veuillez sélectionner une station");
      return;
    }

    setIsSubmitting(true);

    try {
      await saveIndexEntry.mutateAsync({
        stationId: selectedStation.id,
        entryDate: data.date,
        super1: {
          indexDepart: parseFloat(data.super1.indexDepart) || 0,
          indexArrivee: parseFloat(data.super1.indexArrivee) || 0,
          jauge: parseFloat(data.super1.jaugeDuJour) || 0,
        },
        super2: {
          indexDepart: parseFloat(data.super2.indexDepart) || 0,
          indexArrivee: parseFloat(data.super2.indexArrivee) || 0,
          jauge: parseFloat(data.super2.jaugeDuJour) || 0,
        },
        gasoil1: {
          indexDepart: parseFloat(data.gasoil1.indexDepart) || 0,
          indexArrivee: parseFloat(data.gasoil1.indexArrivee) || 0,
          jauge: parseFloat(data.gasoil1.jaugeDuJour) || 0,
        },
        gasoil2: {
          indexDepart: parseFloat(data.gasoil2.indexDepart) || 0,
          indexArrivee: parseFloat(data.gasoil2.indexArrivee) || 0,
          jauge: parseFloat(data.gasoil2.jaugeDuJour) || 0,
        },
        versements: {
          momo: {
            montant: parseFloat(data.versementMomo.montant) || 0,
            reference: data.versementMomo.reference,
          },
          banque: {
            montant: parseFloat(data.versementBanque.montant) || 0,
            reference: data.versementBanque.reference,
          },
          liquidite: {
            montant: parseFloat(data.versementLiquidite.montant) || 0,
            note: data.versementLiquidite.reference,
          },
        },
        bons: {
          carburant: {
            nombre: parseInt(data.bonsCarburant.nombre) || 0,
            valeur: parseFloat(data.bonsCarburant.valeurUnitaire) || 0,
          },
          entreprise: {
            nombre: parseInt(data.bonsEntreprise.nombre) || 0,
            valeur: parseFloat(data.bonsEntreprise.valeurUnitaire) || 0,
          },
        },
      });

      // Compute summary
      const s1 = (parseFloat(data.super1.indexArrivee) || 0) - (parseFloat(data.super1.indexDepart) || 0);
      const s2 = (parseFloat(data.super2.indexArrivee) || 0) - (parseFloat(data.super2.indexDepart) || 0);
      const g1 = (parseFloat(data.gasoil1.indexArrivee) || 0) - (parseFloat(data.gasoil1.indexDepart) || 0);
      const g2 = (parseFloat(data.gasoil2.indexArrivee) || 0) - (parseFloat(data.gasoil2.indexDepart) || 0);
      const superLiters = Math.max(0, s1) + Math.max(0, s2);
      const gasoilLiters = Math.max(0, g1) + Math.max(0, g2);
      const momo = parseFloat(data.versementMomo.montant) || 0;
      const banque = parseFloat(data.versementBanque.montant) || 0;
      const liquidite = parseFloat(data.versementLiquidite.montant) || 0;
      const bonsCarb = (parseInt(data.bonsCarburant.nombre) || 0) * (parseFloat(data.bonsCarburant.valeurUnitaire) || 0);
      const bonsEntr = (parseInt(data.bonsEntreprise.nombre) || 0) * (parseFloat(data.bonsEntreprise.valeurUnitaire) || 0);

      setSubmissionSummary({
        stationName: selectedStation!.name,
        date: data.date,
        superLiters,
        gasoilLiters,
        superAmount: superLiters * FUEL_PRICES.SUPER,
        gasoilAmount: gasoilLiters * FUEL_PRICES.GASOIL,
        momo,
        banque,
        liquidite,
        totalVersements: momo + banque + liquidite,
        bonsCarburant: bonsCarb,
        bonsEntreprise: bonsEntr,
        totalBons: bonsCarb + bonsEntr,
      });

      form.reset(defaultValues);
    } catch (error) {
      // Error is handled by the mutation
    }

    setIsSubmitting(false);
  };

  const ProductEntryCard = ({
    title,
    fieldPrefix,
    productType,
    disableDepart,
  }: {
    title: string;
    fieldPrefix: "super1" | "super2" | "gasoil1" | "gasoil2";
    productType: "super" | "gasoil";
    disableDepart: boolean;
  }) => {
    const colorClass = productType === "super" ? "super" : "gasoil";

    // Calculate quantity in real-time
    const indexArrivee = form.watch(`${fieldPrefix}.indexArrivee`);
    const indexDepart = form.watch(`${fieldPrefix}.indexDepart`);
    const quantity =
      indexArrivee && indexDepart
        ? parseFloat(indexArrivee) - parseFloat(indexDepart)
        : 0;

    return (
      <Card className="bg-card border-border hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full bg-${colorClass}`}
              />
              {title}
            </CardTitle>
            {quantity > 0 && (
              <span className="text-sm font-medium text-success">
                +{formatNumber(quantity)} L
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name={`${fieldPrefix}.indexDepart`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Index Départ {disableDepart && "(veille)"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className={`border-border ${disableDepart ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-secondary"}`}
                      readOnly={disableDepart}
                      tabIndex={disableDepart ? -1 : undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`${fieldPrefix}.indexArrivee`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Index Arrivée
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="bg-secondary border-border"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name={`${fieldPrefix}.jaugeDuJour`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">
                  Jauge du Jour (L)
                </FormLabel>
                <FormControl>
                   <Input
                     type="number"
                     step="1"
                     min="0"
                     placeholder="0"
                     className="bg-secondary border-border"
                     {...field}
                   />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 glow-primary">
                  <Fuel className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-display font-bold">
                    Saisie des Index
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Enregistrement journalier
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DbStationSelector
                selectedStation={selectedStation}
                onSelect={(s) => s && setSelectedStation(s)}
                showAll={false}
              />
              <ProfileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date Selection */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Date de Saisie
                </CardTitle>
                <CardDescription>
                  Sélectionnez la date pour laquelle vous saisissez les index
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="date"
                          className="w-full md:w-64 bg-secondary border-border"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Fiscal Year Closed Warning */}
            {isFiscalYearClosed && (
              <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <Lock className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">
                    Exercice {fiscalYearStatus.year} clôturé
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Les saisies sont bloquées pour cette période. Contactez un administrateur pour réouvrir l'exercice.
                  </p>
                </div>
              </div>
            )}
            {/* Station Info */}
            {selectedStation && (
              <div className="bg-card rounded-xl border border-primary/30 p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Fuel className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold">
                    {selectedStation.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedStation.location}
                  </p>
                </div>
              </div>
            )}

            {/* Previous entry indicator */}
            {selectedStation && (
              <div className={`flex items-center gap-3 rounded-lg p-4 border ${
                previousEntry
                  ? "bg-primary/5 border-primary/20"
                  : "bg-warning/10 border-warning/30"
              }`}>
                {previousEntry ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        Index de départ pré-remplis depuis le{" "}
                        <span className="font-bold text-primary">
                          {new Date(previousEntry.entry_date).toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Les index de départ sont verrouillés et correspondent aux index d'arrivée de la dernière saisie.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-warning shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-warning">
                        Aucune saisie précédente trouvée
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Les index de départ sont en saisie libre. Renseignez les valeurs initiales des compteurs.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Super Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-super" />
                Carburant Super
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProductEntryCard
                  title="Super - Pompe 1 & 2"
                  fieldPrefix="super1"
                  productType="super"
                  disableDepart={hasPreviousEntry}
                />
                <ProductEntryCard
                  title="Super - Pompe 3 & 4"
                  fieldPrefix="super2"
                  productType="super"
                  disableDepart={hasPreviousEntry}
                />
              </div>
            </div>

            {/* Gasoil Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gasoil" />
                Carburant Gasoil
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProductEntryCard
                  title="Gasoil - Pompe 1 & 2"
                  fieldPrefix="gasoil1"
                  productType="gasoil"
                  disableDepart={hasPreviousEntry}
                />
                <ProductEntryCard
                  title="Gasoil - Pompe 3 & 4"
                  fieldPrefix="gasoil2"
                  productType="gasoil"
                  disableDepart={hasPreviousEntry}
                />
              </div>
            </div>

            {/* Versements Section */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Versements du Jour
                </CardTitle>
                <CardDescription>
                  Saisissez les versements effectués par mode de paiement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* MOMO */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-orange-400">
                      <Smartphone className="w-5 h-5" />
                      <span className="font-semibold">Mobile Money</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementMomo.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementMomo.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Référence
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="N° transaction"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Banque */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-blue-400">
                      <Building2 className="w-5 h-5" />
                      <span className="font-semibold">Virement Bancaire</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementBanque.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementBanque.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Référence
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="N° virement"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Liquidité */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-green-400">
                      <Banknote className="w-5 h-5" />
                      <span className="font-semibold">Espèces</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementLiquidite.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementLiquidite.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Note
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Observation"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Total Versements */}
                {(() => {
                  const momo = parseFloat(form.watch("versementMomo.montant") || "0");
                  const banque = parseFloat(form.watch("versementBanque.montant") || "0");
                  const liquidite = parseFloat(form.watch("versementLiquidite.montant") || "0");
                  const total = momo + banque + liquidite;
                  return total > 0 ? (
                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                      <span className="text-sm font-medium">Total Versements</span>
                      <span className="text-lg font-bold text-primary">
                        {formatNumber(total)} FCFA
                      </span>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>

            {/* Bons de Valeur Section */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Bons de Valeur
                </CardTitle>
                <CardDescription>
                  Saisissez les bons de carburant et bons entreprise acceptés
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bons Carburant */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-super">
                      <Receipt className="w-5 h-5" />
                      <span className="font-semibold">Bons Carburant</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="bonsCarburant.nombre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Nombre
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bonsCarburant.valeurUnitaire"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Valeur unitaire (FCFA)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    {(() => {
                      const nombre = parseInt(form.watch("bonsCarburant.nombre") || "0");
                      const valeur = parseFloat(form.watch("bonsCarburant.valeurUnitaire") || "0");
                      const total = nombre * valeur;
                      return total > 0 ? (
                        <div className="text-sm text-right text-super font-medium">
                          Total: {formatNumber(total)} FCFA
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* Bons Entreprise */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-gasoil">
                      <Receipt className="w-5 h-5" />
                      <span className="font-semibold">Bons Entreprise</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="bonsEntreprise.nombre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Nombre
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bonsEntreprise.valeurUnitaire"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Valeur unitaire (FCFA)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    {(() => {
                      const nombre = parseInt(form.watch("bonsEntreprise.nombre") || "0");
                      const valeur = parseFloat(form.watch("bonsEntreprise.valeurUnitaire") || "0");
                      const total = nombre * valeur;
                      return total > 0 ? (
                        <div className="text-sm text-right text-gasoil font-medium">
                          Total: {formatNumber(total)} FCFA
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Total Bons */}
                {(() => {
                  const bonsCarburant = parseInt(form.watch("bonsCarburant.nombre") || "0") * parseFloat(form.watch("bonsCarburant.valeurUnitaire") || "0");
                  const bonsEntreprise = parseInt(form.watch("bonsEntreprise.nombre") || "0") * parseFloat(form.watch("bonsEntreprise.valeurUnitaire") || "0");
                  const total = bonsCarburant + bonsEntreprise;
                  return total > 0 ? (
                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                      <span className="text-sm font-medium">Total Bons de Valeur</span>
                      <span className="text-lg font-bold text-primary">
                        {formatNumber(total)} FCFA
                      </span>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>

            {/* Daily Summary */}
            {(() => {
              // Calculate fuel quantities
              const super1Qty =
                (parseFloat(form.watch("super1.indexArrivee") || "0") -
                  parseFloat(form.watch("super1.indexDepart") || "0")) || 0;
              const super2Qty =
                (parseFloat(form.watch("super2.indexArrivee") || "0") -
                  parseFloat(form.watch("super2.indexDepart") || "0")) || 0;
              const gasoil1Qty =
                (parseFloat(form.watch("gasoil1.indexArrivee") || "0") -
                  parseFloat(form.watch("gasoil1.indexDepart") || "0")) || 0;
              const gasoil2Qty =
                (parseFloat(form.watch("gasoil2.indexArrivee") || "0") -
                  parseFloat(form.watch("gasoil2.indexDepart") || "0")) || 0;

              const totalSuperLiters = Math.max(0, super1Qty) + Math.max(0, super2Qty);
              const totalGasoilLiters = Math.max(0, gasoil1Qty) + Math.max(0, gasoil2Qty);

              // Fuel prices (FCFA per liter)
              const prixSuper = 630;
              const prixGasoil = 575;

              const ventesSuper = totalSuperLiters * prixSuper;
              const ventesGasoil = totalGasoilLiters * prixGasoil;
              const totalVentes = ventesSuper + ventesGasoil;

              // Calculate payments
              const momo = parseFloat(form.watch("versementMomo.montant") || "0");
              const banque = parseFloat(form.watch("versementBanque.montant") || "0");
              const liquidite = parseFloat(form.watch("versementLiquidite.montant") || "0");
              const totalVersements = momo + banque + liquidite;

              // Calculate vouchers
              const bonsCarburant =
                parseInt(form.watch("bonsCarburant.nombre") || "0") *
                parseFloat(form.watch("bonsCarburant.valeurUnitaire") || "0");
              const bonsEntreprise =
                parseInt(form.watch("bonsEntreprise.nombre") || "0") *
                parseFloat(form.watch("bonsEntreprise.valeurUnitaire") || "0");
              const totalBons = bonsCarburant + bonsEntreprise;

              // Total recettes
              const totalRecettes = totalVersements + totalBons;

              // Difference
              const ecart = totalRecettes - totalVentes;

              const hasData = totalVentes > 0 || totalVersements > 0 || totalBons > 0;

              return hasData ? (
                <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/40">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                        Récapitulatif Journalier
                      </CardTitle>
                      <CardDescription>
                        Synthèse des ventes, versements et bons de valeur
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2"
                      onClick={() => {
                        if (!selectedStation) return;
                        exportPdf({
                          stationName: selectedStation.name,
                          stationLocation: selectedStation.location,
                          date: form.watch("date"),
                          super: {
                            liters: totalSuperLiters,
                            amount: ventesSuper,
                          },
                          gasoil: {
                            liters: totalGasoilLiters,
                            amount: ventesGasoil,
                          },
                          versements: {
                            momo,
                            banque,
                            liquidite,
                            total: totalVersements,
                          },
                          bons: {
                            carburant: bonsCarburant,
                            entreprise: bonsEntreprise,
                            total: totalBons,
                          },
                          totalVentes,
                          totalRecettes,
                          ecart,
                        });
                      }}
                    >
                      <FileDown className="w-4 h-4" />
                      Export PDF
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Ventes Section */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-primary" />
                        Ventes de Carburant
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg bg-super/10 border border-super/30">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-super" />
                            <span className="text-sm text-muted-foreground">Super</span>
                          </div>
                          <div className="text-lg font-bold text-super">
                            {formatNumber(totalSuperLiters)} L
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatNumber(ventesSuper)} FCFA
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-gasoil/10 border border-gasoil/30">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-gasoil" />
                            <span className="text-sm text-muted-foreground">Gasoil</span>
                          </div>
                          <div className="text-lg font-bold text-gasoil">
                            {formatNumber(totalGasoilLiters)} L
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatNumber(ventesGasoil)} FCFA
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                          <div className="text-sm text-muted-foreground mb-1">Total Ventes</div>
                          <div className="text-xl font-bold text-primary">
                            {formatNumber(totalVentes)} FCFA
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Versements Section */}
                    {totalVersements > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-primary" />
                          Versements
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {momo > 0 && (
                            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                              <div className="flex items-center gap-2 mb-1">
                                <Smartphone className="w-4 h-4 text-orange-400" />
                                <span className="text-xs text-muted-foreground">MOMO</span>
                              </div>
                              <div className="font-semibold text-orange-400">
                                {formatNumber(momo)} FCFA
                              </div>
                            </div>
                          )}
                          {banque > 0 && (
                            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                              <div className="flex items-center gap-2 mb-1">
                                <Building2 className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-muted-foreground">Banque</span>
                              </div>
                              <div className="font-semibold text-blue-400">
                                {formatNumber(banque)} FCFA
                              </div>
                            </div>
                          )}
                          {liquidite > 0 && (
                            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                              <div className="flex items-center gap-2 mb-1">
                                <Banknote className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-muted-foreground">Espèces</span>
                              </div>
                              <div className="font-semibold text-green-400">
                                {formatNumber(liquidite)} FCFA
                              </div>
                            </div>
                          )}
                          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                            <div className="text-xs text-muted-foreground mb-1">Total Versements</div>
                            <div className="font-bold text-primary">
                              {formatNumber(totalVersements)} FCFA
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bons de Valeur Section */}
                    {totalBons > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-primary" />
                          Bons de Valeur
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {bonsCarburant > 0 && (
                            <div className="p-3 rounded-lg bg-super/10 border border-super/30">
                              <div className="text-xs text-muted-foreground mb-1">Bons Carburant</div>
                              <div className="font-semibold text-super">
                                {formatNumber(bonsCarburant)} FCFA
                              </div>
                            </div>
                          )}
                          {bonsEntreprise > 0 && (
                            <div className="p-3 rounded-lg bg-gasoil/10 border border-gasoil/30">
                              <div className="text-xs text-muted-foreground mb-1">Bons Entreprise</div>
                              <div className="font-semibold text-gasoil">
                                {formatNumber(bonsEntreprise)} FCFA
                              </div>
                            </div>
                          )}
                          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                            <div className="text-xs text-muted-foreground mb-1">Total Bons</div>
                            <div className="font-bold text-primary">
                              {formatNumber(totalBons)} FCFA
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Final Summary */}
                    <div className="pt-4 border-t border-border space-y-3">
                      <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                        <span className="font-medium">Total Recettes (Versements + Bons)</span>
                        <span className="text-xl font-bold">{formatNumber(totalRecettes)} FCFA</span>
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                        <span className="font-medium">Total Ventes Attendu</span>
                        <span className="text-xl font-bold text-primary">{formatNumber(totalVentes)} FCFA</span>
                      </div>
                      <div
                        className={`flex items-center justify-between p-4 rounded-xl border ${
                          ecart === 0
                            ? "bg-success/10 border-success/30"
                            : ecart > 0
                            ? "bg-success/10 border-success/30"
                            : "bg-destructive/10 border-destructive/30"
                        }`}
                      >
                        <span className="font-medium">
                          {ecart >= 0 ? "Excédent" : "Écart (Manquant)"}
                        </span>
                        <span
                          className={`text-xl font-bold ${
                            ecart === 0
                              ? "text-success"
                              : ecart > 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {ecart >= 0 ? "+" : ""}
                          {formatNumber(ecart)} FCFA
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null;
            })()}

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="submit"
                size="lg"
                className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                disabled={isSubmitting || isFiscalYearClosed}
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Enregistrer les Index
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => form.reset(defaultValues)}
                className="border-border"
              >
                Réinitialiser
              </Button>
            </div>

            {Object.keys(form.formState.errors).length > 0 && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <AlertCircle className="w-5 h-5" />
                <span>
                  Veuillez corriger les erreurs dans le formulaire
                </span>
              </div>
            )}
          </form>
        </Form>
      </main>

      {/* Submission Summary Modal */}
      {submissionSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-lg mx-4 shadow-xl border-primary/30">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardCheck className="w-5 h-5 text-success" />
                  Récapitulatif de saisie
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSubmissionSummary(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CardDescription>
                {submissionSummary.stationName} —{" "}
                {new Date(submissionSummary.date).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Quantities */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Fuel className="w-4 h-4" /> Quantités vendues
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                    <p className="text-xs text-muted-foreground">Super</p>
                    <p className="text-lg font-bold">{formatNumber(submissionSummary.superLiters)} L</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(submissionSummary.superAmount)} FCFA</p>
                  </div>
                  <div className="rounded-lg bg-accent/50 border border-border p-3">
                    <p className="text-xs text-muted-foreground">Gasoil</p>
                    <p className="text-lg font-bold">{formatNumber(submissionSummary.gasoilLiters)} L</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(submissionSummary.gasoilAmount)} FCFA</p>
                  </div>
                </div>
                <div className="mt-2 text-right text-sm font-semibold">
                  Total : {formatNumber(submissionSummary.superAmount + submissionSummary.gasoilAmount)} FCFA
                </div>
              </div>

              {/* Versements */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Versements
                </h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5" /> MOMO
                    </span>
                    <span className="font-medium">{formatNumber(submissionSummary.momo)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" /> Banque
                    </span>
                    <span className="font-medium">{formatNumber(submissionSummary.banque)} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Banknote className="w-3.5 h-3.5" /> Espèces
                    </span>
                    <span className="font-medium">{formatNumber(submissionSummary.liquidite)} FCFA</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                    <span>Total versements</span>
                    <span>{formatNumber(submissionSummary.totalVersements)} FCFA</span>
                  </div>
                </div>
              </div>

              {/* Bons */}
              {submissionSummary.totalBons > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> Bons de valeur
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    {submissionSummary.bonsCarburant > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bons carburant</span>
                        <span className="font-medium">{formatNumber(submissionSummary.bonsCarburant)} FCFA</span>
                      </div>
                    )}
                    {submissionSummary.bonsEntreprise > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bons entreprise</span>
                        <span className="font-medium">{formatNumber(submissionSummary.bonsEntreprise)} FCFA</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                      <span>Total bons</span>
                      <span>{formatNumber(submissionSummary.totalBons)} FCFA</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const totalVentes = submissionSummary.superAmount + submissionSummary.gasoilAmount;
                    const totalRecettes = submissionSummary.totalVersements + submissionSummary.totalBons;
                    exportPdf({
                      stationName: submissionSummary.stationName,
                      stationLocation: selectedStation?.location || "",
                      date: submissionSummary.date,
                      super: { liters: submissionSummary.superLiters, amount: submissionSummary.superAmount },
                      gasoil: { liters: submissionSummary.gasoilLiters, amount: submissionSummary.gasoilAmount },
                      versements: {
                        momo: submissionSummary.momo,
                        banque: submissionSummary.banque,
                        liquidite: submissionSummary.liquidite,
                        total: submissionSummary.totalVersements,
                      },
                      bons: {
                        carburant: submissionSummary.bonsCarburant,
                        entreprise: submissionSummary.bonsEntreprise,
                        total: submissionSummary.totalBons,
                      },
                      totalVentes,
                      totalRecettes,
                      ecart: totalRecettes - totalVentes,
                    });
                  }}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Exporter PDF
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setSubmissionSummary(null)}
                >
                  Fermer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 YATT & CO ENERGY BENIN SA - Système de Gestion des Stations</p>
        </div>
      </footer>
    </div>
  );
};

export default IndexEntry;
