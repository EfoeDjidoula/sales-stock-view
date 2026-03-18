import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
  const cleaned = String(value).replace(/[,\s]/g, "").replace("-", "0");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Parse date from Excel serial number or string
const parseExcelDate = (value: unknown): string | null => {
  if (!value) return null;
  
  // Handle Excel serial date number
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  
  // Handle string date like "1/1/26" or "1/2/26"
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

// Extract station name from sheet name
const extractStationName = (sheetName: string): string => {
  // Common patterns: "STATION COTONOU", "STE PORTO-NOVO", etc.
  return sheetName.trim();
};

// Parse a single sheet (station) data
const parseSheetData = (worksheet: XLSX.WorkSheet, stationName: string): ParsedIndexEntry[] => {
  const entries: ParsedIndexEntry[] = [];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
  
  if (data.length < 3) return entries;
  
  // Find header row (contains "PRODUITS", "ARRIVEE", "DEPART")
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
  
  // Find column indices
  const findCol = (keywords: string[]): number => {
    return headerRow.findIndex((h) => 
      keywords.some((k) => String(h || "").toUpperCase().includes(k.toUpperCase()))
    );
  };
  
  const colProduits = findCol(["PRODUITS"]);
  const colArrivee = findCol(["ARRIVEE"]);
  const colDepart = findCol(["DEPART"]);
  const colMomo = findCol(["MOMO"]);
  const colLiquidite = findCol(["LIQUIDITE"]);
  const colBanque = findCol(["VERSEMENT BANQUE", "BANQUE"]);
  const colNumBV = findCol(["NUM BV", "N° BV"]);
  const colBonsYatt = findCol(["BONS YATT"]);
  const colBonsClients = findCol(["BONS CLIENTS"]);
  const colJauge = findCol(["JAUGE DU JOUR", "JAUGE"]);
  
  // Process data rows
  let currentDate: string | null = null;
  let currentEntry: Partial<ParsedIndexEntry> | null = null;
  
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;
    
    // Check for new date in first column
    const dateValue = parseExcelDate(row[0]);
    if (dateValue) {
      // Save previous entry
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
    
    // Get product type from row
    const produit = String(row[colProduits] || "").toUpperCase();
    const arrivee = parseNumber(row[colArrivee]);
    const depart = parseNumber(row[colDepart]);
    
    // Map product rows to entry fields
    if (produit.includes("SUPER 1") || produit === "SUPER 1") {
      currentEntry.super1 = { 
        indexDepart: depart, 
        indexArrivee: arrivee, 
        jauge: colJauge >= 0 ? parseNumber(row[colJauge]) : 0 
      };
    } else if (produit.includes("SUPER 2") || produit === "SUPER 2") {
      currentEntry.super2 = { indexDepart: depart, indexArrivee: arrivee, jauge: 0 };
    } else if (produit.includes("SUPER 3")) {
      // SUPER 3 & 4 map to SUPER 2 in the simplified model
      currentEntry.super2!.indexDepart += depart;
      currentEntry.super2!.indexArrivee += arrivee;
    } else if (produit.includes("SUPER 4")) {
      currentEntry.super2!.indexDepart += depart;
      currentEntry.super2!.indexArrivee += arrivee;
    } else if (produit.includes("GASOIL 1") || produit === "GASOIL 1") {
      currentEntry.gasoil1 = { 
        indexDepart: depart, 
        indexArrivee: arrivee, 
        jauge: colJauge >= 0 ? parseNumber(row[colJauge]) : 0 
      };
    } else if (produit.includes("GASOIL 2") || produit === "GASOIL 2") {
      currentEntry.gasoil2 = { indexDepart: depart, indexArrivee: arrivee, jauge: 0 };
    } else if (produit.includes("GASOIL 3")) {
      currentEntry.gasoil2!.indexDepart += depart;
      currentEntry.gasoil2!.indexArrivee += arrivee;
    } else if (produit.includes("GASOIL 4")) {
      currentEntry.gasoil2!.indexDepart += depart;
      currentEntry.gasoil2!.indexArrivee += arrivee;
    }
    
    // Extract versements and bons from TOTAL row or first product row
    if (produit.includes("SUPER 1") || produit.includes("TOTAL")) {
      if (colMomo >= 0) currentEntry.versements!.momo = parseNumber(row[colMomo]);
      if (colLiquidite >= 0) currentEntry.versements!.liquidite = parseNumber(row[colLiquidite]);
      if (colBanque >= 0) currentEntry.versements!.banque = parseNumber(row[colBanque]);
      if (colNumBV >= 0) currentEntry.versements!.banqueRef = String(row[colNumBV] || "");
      if (colBonsYatt >= 0) currentEntry.bons!.yatt = parseNumber(row[colBonsYatt]);
      if (colBonsClients >= 0) currentEntry.bons!.clients = parseNumber(row[colBonsClients]);
    }
  }
  
  // Don't forget the last entry
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          
          const allEntries: ParsedIndexEntry[] = [];
          
          // Process each sheet (each represents a station)
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const stationName = extractStationName(sheetName);
            const entries = parseSheetData(worksheet, stationName);
            allEntries.push(...entries);
          }
          
          resolve(allEntries);
        } catch (error) {
          reject(new Error(`Erreur de lecture du fichier Excel: ${error}`));
        }
      };
      
      reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
      reader.readAsBinaryString(file);
    });
  };

  const importMutation = useMutation({
    mutationFn: async (entries: ParsedIndexEntry[]): Promise<ImportResult> => {
      if (!user) throw new Error("Utilisateur non authentifié");
      
      const result: ImportResult = { success: 0, failed: 0, errors: [] };
      
      // First, fetch all stations to map names to IDs
      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("id, name");
      
      if (stationsError) throw new Error(`Erreur de récupération des stations: ${stationsError.message}`);
      
      const stationMap = new Map<string, string>();
      stations?.forEach((s) => {
        stationMap.set(s.name.toLowerCase(), s.id);
        // Also try partial matching
        stationMap.set(s.name.toLowerCase().replace(/station\s*/i, ""), s.id);
      });
      
      setProgress({ current: 0, total: entries.length });
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        setProgress({ current: i + 1, total: entries.length });
        
        // Find station ID
        const stationKey = entry.stationName.toLowerCase();
        let stationId = stationMap.get(stationKey);
        
        // Try partial match
        if (!stationId) {
          for (const [key, id] of stationMap) {
            if (stationKey.includes(key) || key.includes(stationKey)) {
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
        description: error instanceof Error ? error.message : "Erreur inconnue" 
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
