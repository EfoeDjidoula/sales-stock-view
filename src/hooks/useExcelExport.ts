import { getActiveBrand } from "@/lib/branding";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScope } from "@/hooks/useScope";
import { toast } from "sonner";
import ExcelJS from "exceljs";

// Excel column structure matching the uploaded file format
const HEADERS_ROW_1 = [
  "", "INDEX", "", "", "", "", "", "",
  "VENTE", "", "", "", "", "", "", "", "", "", "", "", "",
  "SUIVI STOCK", "", "", "", "", "", "", "", "", "",
];

const HEADERS_ROW_2 = [
  "", "PRODUITS", "ARRIVEE", "DEPART", "QUANTITE", "CUMUL", "RET EN CUVE", "SORTIE REELLE",
  "PU", "MONTANT", "BONS YATT", "BONS CLIENTS & TRANS", "BONS DE VALEUR", "CARTES PREPAYEES", "VENTE RELLE",
  "VERSEMENT MOMO", "LIQUIDITE", "VERSEMENT BANQUE", "ECART", "BANQUE", "NUM BV",
  "CUVES", "STOCK OUVERTURE", "DEPOTAGE", "N°BL", "CHAUFFEUR", "ECART AP DEPOTAGE",
  "SORTIE", "STOCK CLOTURE", "JAUGE DU JOUR", "ECART",
];

export const useExcelExport = () => {
  const { user } = useAuth();
  const { scopeQuery } = useScope();
  const [isExporting, setIsExporting] = useState(false);

  const exportToExcel = async (month?: number, year?: number) => {
    if (!user) {
      toast.error("Utilisateur non authentifié");
      return;
    }

    setIsExporting(true);

    try {
      const { data: stations, error: stationsError } = await scopeQuery(
        supabase.from("stations").select("id, name")
      ).order("name");

      if (stationsError) throw stationsError;

      // Configured tanks per station (real names + capacities)
      const { data: tanksData, error: tanksError } = await scopeQuery(
        supabase.from("tanks").select("id, station_id, name, product_type, capacity_liters")
      )
        .order("product_type")
        .order("name");

      if (tanksError) throw tanksError;

      const allTanks = (tanksData || []) as Array<{
        id: string;
        station_id: string;
        name: string;
        product_type: "super" | "gasoil";
        capacity_liters: number;
      }>;

      const now = new Date();
      const targetYear = year ?? now.getFullYear();
      const targetMonth = month ?? now.getMonth() + 1;
      const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
      const endDate = targetMonth === 12
        ? `${targetYear + 1}-01-01`
        : `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;

      const { data: entries, error: entriesError } = await scopeQuery(
        supabase.from("index_entries").select("*")
      )
        .gte("entry_date", startDate)
        .lt("entry_date", endDate)
        .order("entry_date");

      if (entriesError) throw entriesError;

      const workbook = new ExcelJS.Workbook();

      const blankRow = () => Array(31).fill("");
      const dash = (v: number) => (v > 0 ? v : "-");
      const cuveLabel = (name: string, cap: number) =>
        cap > 0 ? `${name} (${cap.toLocaleString("fr-FR")} L)` : name;

      for (const station of stations || []) {
        const stationEntries = (entries || []).filter(
          (e) => e.station_id === station.id
        );

        const stationTanks = allTanks.filter((t) => t.station_id === station.id);
        const superTanks = stationTanks.filter((t) => t.product_type === "super");
        const gasoilTanks = stationTanks.filter((t) => t.product_type === "gasoil");

        const sheetName = station.name.substring(0, 31);
        const worksheet = workbook.addWorksheet(sheetName);

        // Add header rows
        worksheet.addRow(HEADERS_ROW_1);
        worksheet.addRow(HEADERS_ROW_2);

        for (const entry of stationEntries) {
          const [y, m, d] = entry.entry_date.split("-");
          const dateStr = `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;

          // Legacy per-tank index/jauge are stored in up to 2 columns per product.
          const superLegacy = [
            { arrivee: entry.super1_index_arrivee, depart: entry.super1_index_depart, jauge: entry.super1_jauge },
            { arrivee: entry.super2_index_arrivee, depart: entry.super2_index_depart, jauge: entry.super2_jauge },
          ];
          const gasoilLegacy = [
            { arrivee: entry.gasoil1_index_arrivee, depart: entry.gasoil1_index_depart, jauge: entry.gasoil1_jauge },
            { arrivee: entry.gasoil2_index_arrivee, depart: entry.gasoil2_index_depart, jauge: entry.gasoil2_jauge },
          ];

          const super1Qty = entry.super1_index_arrivee - entry.super1_index_depart;
          const super2Qty = entry.super2_index_arrivee - entry.super2_index_depart;
          const gasoil1Qty = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
          const gasoil2Qty = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
          const totalSuper = super1Qty + super2Qty;
          const totalGasoil = gasoil1Qty + gasoil2Qty;
          const superAmount = totalSuper * 695;
          const gasoilAmount = totalGasoil * 720;
          const totalAmount = superAmount + gasoilAmount;

          const productRows: (string | number)[][] = [];

          // Modèle unifié : détail des ventes et versement banque (saisies récentes)
          const e: any = entry;
          const unified = e.vente_globale != null;
          const venteRelle = unified
            ? Number(e.vente_globale) - Number(e.autoconso_montant || 0) - Number(e.bons_clients_montant || 0)
              - Number(e.tickets_valeur_montant || 0) - Number(e.cartes_montant || 0)
            : totalAmount;
          const salesCols = (row: (string | number)[]) => {
            row[10] = (unified ? e.autoconso_montant : entry.bons_carburant_valeur) || "";
            row[11] = (unified ? e.bons_clients_montant : entry.bons_entreprise_valeur) || "";
            row[12] = unified ? e.tickets_valeur_montant || "" : "";
            row[13] = unified ? e.cartes_montant || "" : "";
            row[14] = dash(venteRelle);
            row[15] = entry.versement_momo || "";
            row[16] = (unified ? e.montant_a_verser : entry.versement_liquidite) || "";
            row[17] = entry.versement_banque || "";
            row[18] = unified ? e.ecart_versement ?? "" : "";
            row[19] = unified ? e.banque_nom || "" : "";
            row[20] = entry.versement_banque_ref || "";
          };

          // Use configured tanks when available, otherwise fall back to legacy fixed layout.
          const useSuper = superTanks.length > 0
            ? superTanks.map((t, i) => ({ name: t.name, cap: Number(t.capacity_liters) || 0, legacy: superLegacy[i] }))
            : [
                { name: "SUPER 1", cap: 0, legacy: superLegacy[0] },
                { name: "SUPER 2", cap: 0, legacy: superLegacy[1] },
              ];
          const useGasoil = gasoilTanks.length > 0
            ? gasoilTanks.map((t, i) => ({ name: t.name, cap: Number(t.capacity_liters) || 0, legacy: gasoilLegacy[i] }))
            : [
                { name: "GASOIL 1", cap: 0, legacy: gasoilLegacy[0] },
                { name: "GASOIL 2", cap: 0, legacy: gasoilLegacy[1] },
              ];

          // SUPER rows
          useSuper.forEach((t, i) => {
            const lg = t.legacy;
            const qty = lg ? lg.arrivee - lg.depart : 0;
            const row = blankRow();
            if (i === 0) row[0] = dateStr;
            row[1] = t.name;
            row[2] = lg ? lg.arrivee || "" : "";
            row[3] = lg ? lg.depart || "" : "";
            row[4] = dash(qty);
            if (i === 0) {
              row[5] = dash(totalSuper);
              row[7] = dash(totalSuper);
              row[8] = 695;
              row[9] = dash(superAmount);
              row[7] = dash(totalSuper);
              salesCols(row);
            }
            row[21] = cuveLabel(t.name, t.cap);
            row[27] = i === 0 ? dash(totalSuper) : "";
            row[29] = lg ? lg.jauge || "" : "";
            productRows.push(row);
          });

          // GASOIL rows
          useGasoil.forEach((t, i) => {
            const lg = t.legacy;
            const qty = lg ? lg.arrivee - lg.depart : 0;
            const row = blankRow();
            row[1] = t.name;
            row[2] = lg ? lg.arrivee || "" : "";
            row[3] = lg ? lg.depart || "" : "";
            row[4] = dash(qty);
            if (i === 0) {
              row[5] = dash(totalGasoil);
              row[7] = dash(totalGasoil);
              row[8] = 720;
              row[9] = dash(gasoilAmount);
            }
            row[21] = cuveLabel(t.name, t.cap);
            row[27] = i === 0 ? dash(totalGasoil) : "";
            row[29] = lg ? lg.jauge || "" : "";
            productRows.push(row);
          });

          // TOTAL row
          const totalRow = blankRow();
          totalRow[1] = "TOTAL";
          totalRow[9] = dash(totalAmount);
          salesCols(totalRow);
          productRows.push(totalRow);

          for (const row of productRows) {
            worksheet.addRow(row);
          }
        }

        // Set column widths
        worksheet.columns = Array(31).fill(null).map((_, i) => ({
          width: i === 0 ? 10 : i === 1 ? 12 : (i === 2 || i === 3) ? 14 : i === 21 ? 22 : 12,
        }));
      }

      const fileName = `SUIVI_DES_INDEX_${getActiveBrand().companyName.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}_${targetYear}_${targetMonth}.xlsx`;

      // Generate buffer and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Export réussi", { description: fileName });
    } catch (error) {
      toast.error("Erreur d'export", {
        description: error instanceof Error ? error.message : "Erreur inconnue",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return { exportToExcel, isExporting };
};
