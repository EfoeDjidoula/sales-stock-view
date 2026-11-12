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
import { useLanguage } from "@/hooks/useLanguage";
import { DbStationSelector } from "@/components/dashboard/DbStationSelector";
import { usePumps } from "@/hooks/usePumps";
import { useTanks } from "@/hooks/useTanks";
import { usePumpIndexEntries, usePreviousPumpIndex } from "@/hooks/usePumpIndexEntries";
import { DynamicPumpEntry, type PumpRow, type TankJauge } from "@/components/index-entry/DynamicPumpEntry";
import { useDayPrices, useTankDayContext, useExistingDayEntry } from "@/hooks/useIndexDailyContext";
import { nozzleOutput, num, salesCascade, tankBalance, venteGlobale } from "@/lib/indexModel";
import type { DailyRecapData } from "@/hooks/usePdfExport";
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
  Gauge,
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

// Schema for a single product entry (mode historique, stations sans pompes configurées)
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

const amountSchema = z
  .string()
  .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
    message: "Doit être un nombre positif",
  });

// Main form schema — détail des ventes selon le modèle unifié
const indexEntrySchema = z.object({
  date: z.string().min(1, "Date requise"),
  super1: productEntrySchema,
  super2: productEntrySchema,
  gasoil1: productEntrySchema,
  gasoil2: productEntrySchema,
  autoconso: amountSchema,
  bonsClients: amountSchema,
  ticketsValeur: amountSchema,
  cartes: amountSchema,
  momo: amountSchema,
  momoRef: z.string().optional(),
  banque: amountSchema,
  bordereau: z.string().max(60).optional(),
  banqueNom: z.string().max(60).optional(),
});

type IndexEntryForm = z.infer<typeof indexEntrySchema>;
type AmountKey = "autoconso" | "bonsClients" | "ticketsValeur" | "cartes" | "momo" | "banque";

const defaultValues: IndexEntryForm = {
  date: new Date().toISOString().split("T")[0],
  super1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  super2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  autoconso: "",
  bonsClients: "",
  ticketsValeur: "",
  cartes: "",
  momo: "",
  momoRef: "",
  banque: "",
  bordereau: "",
  banqueNom: "",
};

const signed = (v: number) => `${v > 0 ? "+" : ""}${formatNumber(v)}`;



import { useModules } from "@/hooks/useModules";
import { useLicenseState } from "@/hooks/useLicenseState";
import { LicenseBanner, LicenseBlockedScreen } from "@/components/license/LicenseBanner";
import { useBranding } from "@/hooks/useBranding";
import { AccessDenied } from "@/components/AccessDenied";

const IndexEntry = () => {
  const brand = useBranding();
  const { t } = useLanguage();
  const { isModuleEnabled, isLoading: modulesLoading } = useModules();
  const { data: dbStations } = useStations();
  const { fiscalYears } = useFiscalYears();
  const { user } = useAuth();
  const license = useLicenseState();
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string; location: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState<DailyRecapData | null>(null);
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
  /** Cuves effectivement alimentant au moins un pistolet : elles reçoivent un bilan journalier. */
  const tanksWithPumps = useMemo(
    () => tanks.filter((tk) => pumps.some((p) => p.tank_id === tk.id)),
    [tanks, pumps],
  );

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
          retour: "",
        };
        next[p.id].tankId = p.tank_id;
        next[p.id].productType = p.product_type;
      }
      return next;
    });
    setTankJauges((prev) => {
      const next: Record<string, TankJauge> = {};
      for (const tk of tanks) {
        next[tk.id] = prev[tk.id] || { tankId: tk.id, productType: tk.product_type, jauge: "", ouverture: "" };
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
    if (hasDynamicConfig) return;
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
  }, [previousEntry, form, hasDynamicConfig]);

  const hasPreviousEntry = !!previousEntry;

  // Pump-level: previous index_arrivee per pump (for auto-fill in dynamic mode)
  const pumpIds = useMemo(() => pumps.map((p) => p.id), [pumps]);
  const { data: previousPumpIndex = {} } = usePreviousPumpIndex(selectedStation?.id, pumpIds, selectedDate);
  const hasAnyPreviousPump = Object.keys(previousPumpIndex).length > 0;

  // Prix du jour, stock d'ouverture + dépotages validés par cuve, saisie existante du jour
  const { data: dayPrices } = useDayPrices(selectedDate);
  const prices = dayPrices ?? { super: FUEL_PRICES.SUPER as number, gasoil: FUEL_PRICES.GASOIL as number, source: "Prix par défaut" };
  const { data: tankContext = {} } = useTankDayContext(selectedStation?.id, selectedDate, tanksWithPumps);
  const { data: existingDay } = useExistingDayEntry(selectedStation?.id, selectedDate);

  // Pre-fill pump rows from existing entry on the same date (edit case)
  const { data: existingPumpEntries = [] } = usePumpIndexEntries(selectedStation?.id, selectedDate);
  useEffect(() => {
    if (!existingPumpEntries.length) return;
    setPumpRows((prev) => {
      const next = { ...prev };
      for (const e of existingPumpEntries as any[]) {
        if (next[e.pump_id]) {
          next[e.pump_id] = {
            ...next[e.pump_id],
            indexDepart: String(e.index_depart),
            indexArrivee: String(e.index_arrivee),
            retour: Number(e.retour_cuve) ? String(e.retour_cuve) : "",
          };
        }
      }
      return next;
    });
  }, [existingPumpEntries]);

  // Pre-fill sales detail + tank jauges from the existing entry of the same day
  useEffect(() => {
    const e = existingDay?.entry;
    if (!e) return;
    const str = (v: unknown) => (Number(v) ? String(v) : "");
    form.setValue("autoconso", str(e.autoconso_montant));
    form.setValue("bonsClients", str(e.bons_clients_montant));
    form.setValue("ticketsValeur", str(e.tickets_valeur_montant));
    form.setValue("cartes", str(e.cartes_montant));
    form.setValue("momo", str(e.versement_momo));
    form.setValue("momoRef", e.versement_momo_ref || "");
    form.setValue("banque", str(e.versement_banque));
    form.setValue("bordereau", e.versement_banque_ref || "");
    form.setValue("banqueNom", e.banque_nom || "");
    if (existingDay.readings.length) {
      setTankJauges((prev) => {
        const next = { ...prev };
        for (const r of existingDay.readings) {
          if (next[r.tank_id]) {
            next[r.tank_id] = { ...next[r.tank_id], jauge: String(r.jauge ?? ""), ouverture: String(r.stock_ouverture ?? "") };
          }
        }
        return next;
      });
    }
  }, [existingDay, form]);

  const handlePumpChange = (pumpId: string, patch: Partial<PumpRow>) => {
    setPumpRows((prev) => ({ ...prev, [pumpId]: { ...prev[pumpId], ...patch } }));
  };
  const handleJaugeChange = (tankId: string, patch: Partial<TankJauge>) => {
    setTankJauges((prev) => ({ ...prev, [tankId]: { ...prev[tankId], ...patch } }));
  };

  // ---------- Calculs en direct (modèle unifié) ----------
  const watched = form.watch();
  const productTotals = (product: "super" | "gasoil") => {
    let brut = 0;
    let retour = 0;
    let net = 0;
    let invalid = false;
    if (hasDynamicConfig) {
      for (const p of pumps.filter((x) => x.product_type === product)) {
        const r = pumpRows[p.id];
        const c = nozzleOutput(num(r?.indexDepart), num(r?.indexArrivee), num(r?.retour));
        brut += c.brut;
        retour += c.retour;
        net += c.net;
        invalid = invalid || c.retourInvalide || c.indexInvalide;
      }
    } else {
      const keys = product === "super" ? (["super1", "super2"] as const) : (["gasoil1", "gasoil2"] as const);
      for (const k of keys) {
        const v = Math.max(0, num(watched[k]?.indexArrivee) - num(watched[k]?.indexDepart));
        brut += v;
        net += v;
      }
    }
    return { brut, retour, net, invalid };
  };
  const sup = productTotals("super");
  const gas = productTotals("gasoil");
  const venteG = venteGlobale(sup.net, gas.net, prices.super, prices.gasoil);
  const cascade = salesCascade(
    venteG,
    {
      autoconso: num(watched.autoconso),
      bonsClients: num(watched.bonsClients),
      ticketsValeur: num(watched.ticketsValeur),
      cartes: num(watched.cartes),
      momo: num(watched.momo),
    },
    num(watched.banque),
  );
  const tankRows = tanksWithPumps.map((tk) => {
    const ctx = tankContext[tk.id];
    const tj = tankJauges[tk.id];
    const ouvertureKnown = ctx?.stockOuverture != null;
    const ouverture = ouvertureKnown ? (ctx!.stockOuverture as number) : num(tj?.ouverture);
    const sortie = pumps
      .filter((p) => p.tank_id === tk.id)
      .reduce((a, p) => {
        const r = pumpRows[p.id];
        return a + nozzleOutput(num(r?.indexDepart), num(r?.indexArrivee), num(r?.retour)).net;
      }, 0);
    const bal = tankBalance(ouverture, ctx?.depotage ?? 0, sortie, num(tj?.jauge));
    return { tank: tk, ctx, tj, ouvertureKnown, bal, jaugeFilled: !!tj?.jauge, ouvertureFilled: ouvertureKnown || !!tj?.ouverture };
  });

  const buildRecap = (
    override?: { venteGlobale?: number; montantAVerser?: number; ecartVersement?: number; readings?: any[] },
  ): DailyRecapData => {
    const tanksRecap = override?.readings?.length
      ? override.readings.map((r) => ({
          name: tanks.find((tk) => tk.id === r.tank_id)?.name || "Cuve",
          product: r.product_type as "super" | "gasoil",
          ouverture: Number(r.stock_ouverture) || 0,
          depotage: Number(r.depotage) || 0,
          sortie: Number(r.sortie) || 0,
          cloture: Number(r.stock_cloture) || 0,
          jauge: Number(r.jauge) || 0,
          ecart: Number(r.ecart) || 0,
        }))
      : tankRows.map((r) => ({
          name: r.tank.name,
          product: r.tank.product_type,
          ouverture: r.bal.stockOuverture,
          depotage: r.bal.depotage,
          sortie: r.bal.sortie,
          cloture: r.bal.stockCloture,
          jauge: r.bal.jauge,
          ecart: r.bal.ecart,
        }));
    tanksRecap.sort((a, b) => (a.product === b.product ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.product === "super" ? -1 : 1));
    return {
      stationName: selectedStation?.name || "",
      stationLocation: selectedStation?.location || "",
      date: watched.date,
      prices: { super: prices.super, gasoil: prices.gasoil },
      super: { brut: sup.brut, retour: sup.retour, liters: sup.net, amount: sup.net * prices.super },
      gasoil: { brut: gas.brut, retour: gas.retour, liters: gas.net, amount: gas.net * prices.gasoil },
      venteGlobale: override?.venteGlobale ?? cascade.venteGlobale,
      autoconso: num(watched.autoconso),
      bonsClients: num(watched.bonsClients),
      ticketsValeur: num(watched.ticketsValeur),
      cartes: num(watched.cartes),
      momo: num(watched.momo),
      momoRef: watched.momoRef || undefined,
      montantAVerser: override?.montantAVerser ?? cascade.montantAVerser,
      versementBanque: num(watched.banque),
      bordereau: watched.bordereau || undefined,
      banqueNom: watched.banqueNom || undefined,
      ecartVersement: override?.ecartVersement ?? cascade.ecartVersement,
      tanks: tanksRecap,
    };
  };

  /** Agrège les pistolets dans les colonnes historiques super1/gasoil1 pour les tableaux de bord.
   *  L'index d'arrivée agrégé est diminué du retour en cuve : le volume historique = sortie réelle.
   *  Jauges : 1re cuve super → super1.jauge, 2e → super2.jauge (idem gasoil). */
  const buildLegacyFromDynamic = () => {
    const sumByProduct = (product: "super" | "gasoil") => {
      let depart = 0;
      let arrivee = 0;
      for (const p of pumps.filter((x) => x.product_type === product)) {
        const r = pumpRows[p.id];
        if (!r) continue;
        const d = num(r.indexDepart);
        const c = nozzleOutput(d, num(r.indexArrivee), num(r.retour));
        depart += d;
        arrivee += d + c.net;
      }
      return { depart, arrivee };
    };
    const superTanks = tanks.filter((tk) => tk.product_type === "super");
    const gasoilTanks = tanks.filter((tk) => tk.product_type === "gasoil");
    const jaugeOf = (tk?: { id: string }) => (tk ? num(tankJauges[tk.id]?.jauge) : 0);
    const s = sumByProduct("super");
    const g = sumByProduct("gasoil");
    return {
      super1: { indexDepart: s.depart, indexArrivee: s.arrivee, jauge: jaugeOf(superTanks[0]) },
      super2: { indexDepart: 0, indexArrivee: 0, jauge: jaugeOf(superTanks[1]) },
      gasoil1: { indexDepart: g.depart, indexArrivee: g.arrivee, jauge: jaugeOf(gasoilTanks[0]) },
      gasoil2: { indexDepart: 0, indexArrivee: 0, jauge: jaugeOf(gasoilTanks[1]) },
    };
  };

  const buildPumpEntries = (): PumpEntryInput[] =>
    pumps.map((p) => {
      const r = pumpRows[p.id];
      return {
        pumpId: p.id,
        tankId: p.tank_id,
        productType: p.product_type,
        indexDepart: num(r?.indexDepart),
        indexArrivee: num(r?.indexArrivee),
        retour: num(r?.retour),
      };
    });

  const applyDynamicPlaceholders = () => {
    (["super1", "super2", "gasoil1", "gasoil2"] as const).forEach((k) => {
      form.setValue(`${k}.indexArrivee`, "0");
      form.setValue(`${k}.indexDepart`, "0");
      form.setValue(`${k}.jaugeDuJour`, "0");
    });
  };

  // In dynamic mode, satisfy legacy zod validation by setting placeholder "0" values.
  useEffect(() => {
    if (!hasDynamicConfig) return;
    applyDynamicPlaceholders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDynamicConfig, form]);

  const resetForm = () => {
    form.reset({ ...defaultValues, date: form.getValues("date") });
    if (hasDynamicConfig) applyDynamicPlaceholders();
    setPumpRows((prev) => {
      const next: Record<string, PumpRow> = {};
      for (const id of Object.keys(prev)) next[id] = { ...prev[id], indexArrivee: "", retour: "" };
      return next;
    });
    setTankJauges((prev) => {
      const next: Record<string, TankJauge> = {};
      for (const id of Object.keys(prev)) next[id] = { ...prev[id], jauge: "", ouverture: "" };
      return next;
    });
  };

  const onSubmit = async (data: IndexEntryForm) => {
    if (!selectedStation) {
      toast.error("Veuillez sélectionner une station");
      return;
    }
    if (hasDynamicConfig) {
      if (sup.invalid || gas.invalid) {
        toast.error("Index ou retour en cuve incohérent", {
          description: "Corrigez les pistolets signalés en rouge avant d'enregistrer.",
        });
        return;
      }
      const missingJauge = tankRows.filter((r) => !r.jaugeFilled).map((r) => r.tank.name);
      if (missingJauge.length) {
        toast.error("Jauge du jour manquante", { description: `Cuve(s) : ${missingJauge.join(", ")}` });
        return;
      }
      const missingOuv = tankRows.filter((r) => !r.ouvertureFilled).map((r) => r.tank.name);
      if (missingOuv.length) {
        toast.error("Stock d'ouverture manquant", { description: `Première saisie pour : ${missingOuv.join(", ")}` });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const legacy = hasDynamicConfig
        ? buildLegacyFromDynamic()
        : {
            super1: { indexDepart: num(data.super1.indexDepart), indexArrivee: num(data.super1.indexArrivee), jauge: num(data.super1.jaugeDuJour) },
            super2: { indexDepart: num(data.super2.indexDepart), indexArrivee: num(data.super2.indexArrivee), jauge: num(data.super2.jaugeDuJour) },
            gasoil1: { indexDepart: num(data.gasoil1.indexDepart), indexArrivee: num(data.gasoil1.indexArrivee), jauge: num(data.gasoil1.jaugeDuJour) },
            gasoil2: { indexDepart: num(data.gasoil2.indexDepart), indexArrivee: num(data.gasoil2.indexArrivee), jauge: num(data.gasoil2.jaugeDuJour) },
          };

      const saved = await saveIndexEntry.mutateAsync({
        stationId: selectedStation.id,
        entryDate: data.date,
        ...legacy,
        pumpEntries: hasDynamicConfig ? buildPumpEntries() : undefined,
        tankReadings: hasDynamicConfig
          ? tankRows.map((r) => ({
              tankId: r.tank.id,
              productType: r.tank.product_type,
              stockOuverture: r.bal.stockOuverture,
              jauge: r.bal.jauge,
            }))
          : undefined,
        sales: {
          venteGlobale: cascade.venteGlobale,
          autoconso: num(data.autoconso),
          bonsClients: num(data.bonsClients),
          ticketsValeur: num(data.ticketsValeur),
          cartes: num(data.cartes),
          banqueNom: data.banqueNom,
        },
        versements: {
          momo: { montant: num(data.momo), reference: data.momoRef },
          banque: { montant: num(data.banque), reference: data.bordereau },
          liquidite: { montant: 0 },
        },
        bons: {
          carburant: { nombre: 0, valeur: 0 },
          entreprise: { nombre: 0, valeur: 0 },
        },
      });

      const e = saved.entry || {};
      setSubmissionSummary(
        buildRecap({
          venteGlobale: e.vente_globale != null ? Number(e.vente_globale) : undefined,
          montantAVerser: e.montant_a_verser != null ? Number(e.montant_a_verser) : undefined,
          ecartVersement: e.ecart_versement != null ? Number(e.ecart_versement) : undefined,
          readings: saved.readings,
        }),
      );
      resetForm();
    } catch (error) {
      // Error is handled by the mutation
    }
    setIsSubmitting(false);
  };

  const renderAmount = (name: AmountKey, label: string, hint?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder="0"
              className="bg-background border-border"
              disabled={isFiscalYearClosed}
              {...field}
            />
          </FormControl>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );

  const renderText = (name: "momoRef" | "bordereau" | "banqueNom", label: string, placeholder: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
          <FormControl>
            <Input placeholder={placeholder} className="bg-background border-border" disabled={isFiscalYearClosed} {...field} />
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );



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

  // Module "Index" désactivé pour cette société / ce pays : accès direct par URL bloqué
  if (!modulesLoading && !isModuleEnabled("index")) {
    return (
      <div className="min-h-screen bg-background p-8">
        <AccessDenied />
      </div>
    );
  }

  if (license.isBlocked) return <LicenseBlockedScreen />;

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
                     {t("Saisie des Index")}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                     {t("Enregistrement journalier")}
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
        <LicenseBanner />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date Selection */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                   {t("Date de Saisie")}
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

            {hasDynamicConfig ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-primary" />
                    Saisie par pompe & cuve
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {pumps.length} pompe(s) · {tanks.length} cuve(s) configurée(s)
                  </span>
                </div>
                <DynamicPumpEntry
                  pumps={pumps}
                  tanks={tanks}
                  pumpRows={pumpRows}
                  tankJauges={tankJauges}
                  previousIndex={previousPumpIndex}
                  hasPrevious={hasAnyPreviousPump}
                  onChangePump={handlePumpChange}
                  onChangeJauge={handleJaugeChange}
                  tankContext={tankContext}
                  prices={prices}
                  disabled={isFiscalYearClosed}
                />
              </div>
            ) : (
              <>
                {/* Super Section (legacy) */}
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

                {/* Gasoil Section (legacy) */}
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
              </>
            )}

            {/* Détail des ventes & versement banque */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Détail des ventes & versement banque
                  </CardTitle>
                  <CardDescription>
                    La vente globale est répartie par mode de règlement ; le reste est à verser en banque.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={!selectedStation || cascade.venteGlobale <= 0}
                  onClick={() => exportPdf(buildRecap())}
                >
                  <FileDown className="w-4 h-4" />
                  Export PDF
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Vente globale */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-super/10 border border-super/30">
                    <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-super" /> Super — sortie réelle
                    </div>
                    <div className="text-lg font-bold text-super">{formatNumber(sup.net)} L</div>
                    <div className="text-xs text-muted-foreground">
                      × {formatNumber(prices.super)} = {formatNumber(sup.net * prices.super)} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gasoil/10 border border-gasoil/30">
                    <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-gasoil" /> Gasoil — sortie réelle
                    </div>
                    <div className="text-lg font-bold text-gasoil">{formatNumber(gas.net)} L</div>
                    <div className="text-xs text-muted-foreground">
                      × {formatNumber(prices.gasoil)} = {formatNumber(gas.net * prices.gasoil)} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="text-sm text-muted-foreground mb-1">Vente globale</div>
                    <div className="text-xl font-bold text-primary">{formatNumber(cascade.venteGlobale)} FCFA</div>
                    <div className="text-[11px] text-muted-foreground">{prices.source}</div>
                  </div>
                </div>

                {/* Ventes hors espèces */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-primary" /> À déduire de la vente globale (FCFA)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    {renderAmount("autoconso", "Autoconsommation", "Ex-bons YATT")}
                    {renderAmount("bonsClients", "Bons clients")}
                    {renderAmount("ticketsValeur", "Tickets valeur")}
                    {renderAmount("cartes", "Ventes par carte")}
                    <div className="space-y-2">
                      {renderAmount("momo", "Mobile Money")}
                      {renderText("momoRef", "Réf. Mobile Money", "N° transaction")}
                    </div>
                  </div>
                </div>

                {/* Montant à verser */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/60 border border-border">
                  <div>
                    <div className="font-semibold">Montant à verser en banque</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(cascade.venteGlobale)} − {formatNumber(cascade.totalDeductions)} FCFA
                    </div>
                  </div>
                  <span className="text-xl font-bold">{formatNumber(cascade.montantAVerser)} FCFA</span>
                </div>

                {/* Versement banque */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" /> Versement en banque
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    {renderAmount("banque", "Montant versé en banque (FCFA)")}
                    {renderText("bordereau", "N° bordereau (BV)", "Ex. 288009")}
                    {renderText("banqueNom", "Banque", "Ex. SGB")}
                  </div>
                </div>

                {/* Écart sur versement */}
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    cascade.ecartVersement < 0
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-success/10 border-success/30"
                  }`}
                >
                  <div>
                    <div className="font-semibold">
                      Écart sur versement {cascade.ecartVersement < 0 ? "(manquant)" : cascade.ecartVersement > 0 ? "(excédent)" : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">Montant versé − Montant à verser</div>
                  </div>
                  <span
                    className={`text-xl font-bold ${cascade.ecartVersement < 0 ? "text-destructive" : "text-success"}`}
                  >
                    {signed(cascade.ecartVersement)} FCFA
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Synthèse du suivi stock */}
            {hasDynamicConfig && tankRows.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-primary" />
                    Synthèse du suivi stock
                  </CardTitle>
                  <CardDescription>
                    Stock clôture théorique = ouverture + dépotages validés − sorties réelles ; écart = jauge − stock théorique.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left py-2">Cuve</th>
                        <th className="text-right">Ouverture</th>
                        <th className="text-right">Dépotage</th>
                        <th className="text-right">Sortie</th>
                        <th className="text-right">Clôture théo.</th>
                        <th className="text-right">Jauge</th>
                        <th className="text-right">Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tankRows.map((r) => (
                        <tr key={r.tank.id} className="border-b border-border/50">
                          <td className="py-2">
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-${r.tank.product_type}`} />
                            {r.tank.name}
                          </td>
                          <td className="text-right">{formatNumber(r.bal.stockOuverture)}</td>
                          <td className="text-right">{formatNumber(r.bal.depotage)}</td>
                          <td className="text-right">{formatNumber(r.bal.sortie)}</td>
                          <td className="text-right font-medium">{formatNumber(r.bal.stockCloture)}</td>
                          <td className="text-right">{r.jaugeFilled ? formatNumber(r.bal.jauge) : "—"}</td>
                          <td
                            className={`text-right font-bold ${
                              !r.jaugeFilled ? "text-muted-foreground" : r.bal.ecart < 0 ? "text-destructive" : "text-success"
                            }`}
                          >
                            {r.jaugeFilled ? signed(r.bal.ecart) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}


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
                onClick={resetForm}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg shadow-xl border-primary/30 max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardCheck className="w-5 h-5 text-success" />
                  Saisie enregistrée
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setSubmissionSummary(null)}>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-super/10 border border-super/30 p-3">
                  <p className="text-xs text-muted-foreground">Super — sortie réelle</p>
                  <p className="text-lg font-bold">{formatNumber(submissionSummary.super.liters)} L</p>
                  <p className="text-xs text-muted-foreground">Retour cuve {formatNumber(submissionSummary.super.retour)} L</p>
                </div>
                <div className="rounded-lg bg-gasoil/10 border border-gasoil/30 p-3">
                  <p className="text-xs text-muted-foreground">Gasoil — sortie réelle</p>
                  <p className="text-lg font-bold">{formatNumber(submissionSummary.gasoil.liters)} L</p>
                  <p className="text-xs text-muted-foreground">Retour cuve {formatNumber(submissionSummary.gasoil.retour)} L</p>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                {[
                  ["Vente globale", submissionSummary.venteGlobale],
                  ["Autoconsommation", -submissionSummary.autoconso],
                  ["Bons clients", -submissionSummary.bonsClients],
                  ["Tickets valeur", -submissionSummary.ticketsValeur],
                  ["Ventes par carte", -submissionSummary.cartes],
                  ["Mobile Money", -submissionSummary.momo],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{formatNumber(v as number)} FCFA</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Montant à verser</span>
                  <span>{formatNumber(submissionSummary.montantAVerser)} FCFA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Versé en banque{submissionSummary.bordereau ? ` (BV ${submissionSummary.bordereau})` : ""}
                  </span>
                  <span className="font-medium">{formatNumber(submissionSummary.versementBanque)} FCFA</span>
                </div>
                <div
                  className={`flex justify-between font-bold ${
                    submissionSummary.ecartVersement < 0 ? "text-destructive" : "text-success"
                  }`}
                >
                  <span>Écart sur versement</span>
                  <span>{signed(submissionSummary.ecartVersement)} FCFA</span>
                </div>
              </div>

              {submissionSummary.tanks.length > 0 && (
                <div className="space-y-1.5 text-sm">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Gauge className="w-4 h-4" /> Écart sur stock
                  </h4>
                  {submissionSummary.tanks.map((tk) => (
                    <div key={tk.name} className="flex justify-between">
                      <span className="text-muted-foreground">
                        Cuve {tk.name} · théorique {formatNumber(tk.cloture)} L / jauge {formatNumber(tk.jauge)} L
                      </span>
                      <span className={`font-semibold ${tk.ecart < 0 ? "text-destructive" : "text-success"}`}>
                        {signed(tk.ecart)} L
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => exportPdf(submissionSummary)}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Exporter PDF
                </Button>
                <Button className="flex-1" onClick={() => setSubmissionSummary(null)}>
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
          <p>
            © {new Date().getFullYear()} {brand.legalName}
            {brand.footerNote ? ` · ${brand.footerNote}` : ""}
          </p>
          {brand.poweredBy && (
            <p className="mt-1 text-xs opacity-70">{brand.poweredBy}</p>
          )}
        </div>
      </footer>
    </div>
  );
};

export default IndexEntry;
