import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ExcelJS from "exceljs";

export interface ParsedIndexEntry {
  date: string;
  stationName: string;
  super1: { indexDepart: number; indexArrivee: number; jauge: number };
  super2: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil1: { indexDepart: number; indexArrivee: number; jauge: number };
  gasoil2: { indexDepart: number; indexArrivee: number; jauge: number };
  versements: {
    momo: number;
    banque: number;
    liquidite: number;
    banqueRef?: string;
  };
  bons: {
    yatt: number;
    clients: number;
  };
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

// Parse a numeric value from Excel cell
const parseNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "" || value === "-") return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[,\s]/g, "").replace(/^-$/, "0");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Parse Excel serial date number to YYYY-MM-DD
const excelSerialToDate = (serial: number): string | null => {
  // Excel dates are days since 1900-01-01 (with a bug treating 1900 as leap year)
  const utcDays = Math.floor(serial) - 25569;
  const date = new Date(utcDays * 86400000);
  if (isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Parse date from Excel cell value
const parseExcelDate = (value: unknown): string | null => {
  if (!value) return null;

  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  if (typeof value === "string") {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const [, month, day, yearShort] = match;
      const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return null;
};

// Convert ExcelJS row to array of values
const rowToArray = (row: ExcelJS.Row): unknown[] => {
  const values: unknown[] = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    while (values.length < colNumber - 1) values.push(null);
    values.push(cell.value);
  });
  return values;
};

// Parse a single worksheet (station) data
const parseWorksheetData = (worksheet: ExcelJS.Worksheet, stationName: string): ParsedIndexEntry[] => {
  const entries: ParsedIndexEntry[] = [];

  // Build a 2D array from the worksheet
  const data: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    data.push(rowToArray(row));
  });

  if (data.length < 3) return entries;

  // Find header row containing "PRODUITS"
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && row.some((cell) => String(cell).toUpperCase().includes("PRODUITS"))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) return entries;

  const headerRow = data[headerRowIndex] as string[];

  const findCol = (keywords: string[]): number => {
    return headerRow.findIndex((h) =>
      keywords.some((k) => String(h || "").toUpperCase().includes(k.toUpperCase()))
    );
  };

  const colProduits = findCol(["PRODUITS"]);
  const colArrivee = findCol(["ARRIVEE"]);
  const colDepart = findCol(["DEPART"]);
  const colMomo = findCol(["MOMO", "VERSEMENT MOMO"]);
  const colLiquidite = findCol(["LIQUIDITE"]);
  const colBanque = findCol(["VERSEMENT BANQUE"]);
  const colNumBV = findCol(["NUM BV", "N° BV", "N°BV"]);
  const colBonsYatt = findCol(["BONS YATT", "BONS DE VALEUR"]);
  const colBonsClients = findCol(["BONS CLIENTS", "CARTES PREPAYEES"]);
  const colJauge = findCol(["JAUGE DU JOUR", "JAUGE"]);

  let currentDate: string | null = null;
  let currentEntry: Partial<ParsedIndexEntry> | null = null;

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const dateValue = parseExcelDate(row[0]);
    if (dateValue) {
      if (currentEntry && currentEntry.date) {
        entries.push(currentEntry as ParsedIndexEntry);
      }

      currentDate = dateValue;
      currentEntry = {
        date: currentDate,
        stationName,
        super1: { indexDepart: 0, indexArrivee: 0, jauge: 0 },
        super2: { indexDepart: 0, indexArrivee: 0, jauge: 0 },
        gasoil1: { indexDepart: 0, indexArrivee: 0, jauge: 0 },
        gasoil2: { indexDepart: 0, indexArrivee: 0, jauge: 0 },
        versements: { momo: 0, banque: 0, liquidite: 0 },
        bons: { yatt: 0, clients: 0 },
      };
    }

    if (!currentEntry || !currentDate) continue;

    const produit = String(row[colProduits] || "").toUpperCase().trim();
    const arrivee = parseNumber(row[colArrivee]);
    const depart = parseNumber(row[colDepart]);
    const jauge = colJauge >= 0 ? parseNumber(row[colJauge]) : 0;

    if (produit === "SUPER 1" || produit === "SUPER 2") {
      currentEntry.super1!.indexDepart += depart;
      currentEntry.super1!.indexArrivee += arrivee;
      if (produit === "SUPER 1") currentEntry.super1!.jauge = jauge;
    } else if (produit.startsWith("SUPER") && !produit.includes("TOTAL")) {
      currentEntry.super2!.indexDepart += depart;
      currentEntry.super2!.indexArrivee += arrivee;
      if (produit === "SUPER 3") currentEntry.super2!.jauge = jauge;
    } else if (produit === "GASOIL 1" || produit === "GASOIL 2") {
      currentEntry.gasoil1!.indexDepart += depart;
      currentEntry.gasoil1!.indexArrivee += arrivee;
      if (produit === "GASOIL 1") currentEntry.gasoil1!.jauge = jauge;
    } else if (produit.startsWith("GASOIL") && !produit.includes("TOTAL")) {
      currentEntry.gasoil2!.indexDepart += depart;
      currentEntry.gasoil2!.indexArrivee += arrivee;
      if (produit === "GASOIL 3") currentEntry.gasoil2!.jauge = jauge;
    }

    if (produit === "SUPER 1") {
      if (colMomo >= 0) currentEntry.versements!.momo = parseNumber(row[colMomo]);
      if (colLiquidite >= 0) currentEntry.versements!.liquidite = parseNumber(row[colLiquidite]);
      if (colBanque >= 0) currentEntry.versements!.banque = parseNumber(row[colBanque]);
      if (colNumBV >= 0) currentEntry.versements!.banqueRef = String(row[colNumBV] || "");
      if (colBonsYatt >= 0) currentEntry.bons!.yatt = parseNumber(row[colBonsYatt]);
      if (colBonsClients >= 0) currentEntry.bons!.clients = parseNumber(row[colBonsClients]);
    }
    if (produit === "TOTAL") {
      if (colMomo >= 0 && !currentEntry.versements!.momo) {
        currentEntry.versements!.momo = parseNumber(row[colMomo]);
      }
      if (colLiquidite >= 0 && !currentEntry.versements!.liquidite) {
        currentEntry.versements!.liquidite = parseNumber(row[colLiquidite]);
      }
      if (colBanque >= 0 && !currentEntry.versements!.banque) {
        currentEntry.versements!.banque = parseNumber(row[colBanque]);
      }
    }
  }

  if (currentEntry && currentEntry.date) {
    entries.push(currentEntry as ParsedIndexEntry);
  }

  return entries;
};

export const useExcelImport = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const parseExcelFile = async (file: File): Promise<ParsedIndexEntry[]> => {
    const arrayBuffer = await file.arrayBuffer();

    // Detect the real file signature (extensions can lie).
    const sig = new Uint8Array(arrayBuffer.slice(0, 8));
    const isZip = sig[0] === 0x50 && sig[1] === 0x4b; // "PK" → real .xlsx
    const isOle2 =
      sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0; // legacy .xls

    if (isOle2) {
      throw new Error(
        "Ce fichier est au format Excel ancien (.xls). Ouvrez-le dans Excel ou Google Sheets puis enregistrez-le au format .xlsx avant de réimporter.",
      );
    }

    if (!isZip) {
      throw new Error(
        "Le fichier n'est pas un classeur Excel valide (.xlsx). Vérifiez qu'il n'est pas corrompu ni renommé, puis réessayez.",
      );
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(arrayBuffer);
    } catch (e) {
      throw new Error(
        "Impossible de lire le contenu du fichier Excel. Réenregistrez-le depuis Excel au format .xlsx (Classeur Excel) puis réessayez." +
          (e instanceof Error ? ` (${e.message})` : ""),
      );
    }

    const allEntries: ParsedIndexEntry[] = [];

    workbook.eachSheet((worksheet) => {
      try {
        const stationName = (worksheet.name || "").trim().toUpperCase();
        const entries = parseWorksheetData(worksheet, stationName);
        allEntries.push(...entries);
      } catch (e) {
        // A single malformed sheet shouldn't block the whole import.
        console.error(`Erreur de lecture de l'onglet "${worksheet.name}":`, e);
      }
    });

    return allEntries;
  };

  const importMutation = useMutation({
    mutationFn: async (entries: ParsedIndexEntry[]): Promise<ImportResult> => {
      if (!user) throw new Error("Utilisateur non authentifié");

      const result: ImportResult = { success: 0, failed: 0, errors: [] };

      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("id, name");

      if (stationsError) throw new Error(`Erreur de récupération des stations: ${stationsError.message}`);

      const stationMap = new Map<string, string>();
      stations?.forEach((s) => {
        stationMap.set(s.name.toUpperCase(), s.id);
      });

      setProgress({ current: 0, total: entries.length });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        setProgress({ current: i + 1, total: entries.length });

        let stationId = stationMap.get(entry.stationName.toUpperCase());

        if (!stationId) {
          for (const [key, id] of stationMap) {
            if (entry.stationName.includes(key) || key.includes(entry.stationName)) {
              stationId = id;
              break;
            }
          }
        }

        if (!stationId) {
          result.failed++;
          result.errors.push(`Station non trouvée: ${entry.stationName} (${entry.date})`);
          continue;
        }

        const dbEntry = {
          user_id: user.id,
          station_id: stationId,
          entry_date: entry.date,
          super1_index_depart: entry.super1.indexDepart,
          super1_index_arrivee: entry.super1.indexArrivee,
          super1_jauge: entry.super1.jauge,
          super2_index_depart: entry.super2.indexDepart,
          super2_index_arrivee: entry.super2.indexArrivee,
          super2_jauge: entry.super2.jauge,
          gasoil1_index_depart: entry.gasoil1.indexDepart,
          gasoil1_index_arrivee: entry.gasoil1.indexArrivee,
          gasoil1_jauge: entry.gasoil1.jauge,
          gasoil2_index_depart: entry.gasoil2.indexDepart,
          gasoil2_index_arrivee: entry.gasoil2.indexArrivee,
          gasoil2_jauge: entry.gasoil2.jauge,
          versement_momo: entry.versements.momo,
          versement_banque: entry.versements.banque,
          versement_banque_ref: entry.versements.banqueRef || null,
          versement_liquidite: entry.versements.liquidite,
          bons_carburant_nombre: 0,
          bons_carburant_valeur: entry.bons.yatt,
          bons_entreprise_nombre: 0,
          bons_entreprise_valeur: entry.bons.clients,
        };

        const { error } = await supabase
          .from("index_entries")
          .upsert(dbEntry, {
            onConflict: "user_id,station_id,entry_date",
          });

        if (error) {
          result.failed++;
          result.errors.push(`${entry.stationName} ${entry.date}: ${error.message}`);
        } else {
          result.success++;
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
      queryClient.invalidateQueries({ queryKey: ["latest-jauge"] });
      queryClient.invalidateQueries({ queryKey: ["stock-jauges"] });
      if (result.success > 0) {
        toast.success(`${result.success} entrées importées avec succès`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} entrées en échec`, {
          description: result.errors.slice(0, 3).join("\n"),
        });
      }
      setIsProcessing(false);
    },
    onError: (error: Error) => {
      toast.error("Erreur d'importation", { description: error.message });
      setIsProcessing(false);
    },
  });

  const importFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const entries = await parseExcelFile(file);
      if (entries.length === 0) {
        toast.warning("Aucune donnée trouvée dans le fichier");
        setIsProcessing(false);
        return;
      }

      toast.info(`${entries.length} entrées détectées, importation en cours...`);
      await importMutation.mutateAsync(entries);
    } catch (error) {
      toast.error("Erreur de lecture du fichier", {
        description: error instanceof Error ? error.message : "Erreur inconnue",
      });
      setIsProcessing(false);
    }
  };

  return {
    importFile,
    parseExcelFile,
    isProcessing,
    progress,
    isPending: importMutation.isPending,
  };
};
