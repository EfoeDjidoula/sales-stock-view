import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const useExcelExport = () => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const exportToExcel = async (month?: number, year?: number) => {
    if (!user) {
      toast.error("Utilisateur non authentifié");
      return;
    }

    setIsExporting(true);

    try {
      // Fetch stations
      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("id, name")
        .order("name");

      if (stationsError) throw stationsError;

      // Build date filter
      const now = new Date();
      const targetYear = year ?? now.getFullYear();
      const targetMonth = month ?? now.getMonth() + 1;
      const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
      const endDate = targetMonth === 12
        ? `${targetYear + 1}-01-01`
        : `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;

      // Fetch all entries for the period
      const { data: entries, error: entriesError } = await supabase
        .from("index_entries")
        .select("*")
        .gte("entry_date", startDate)
        .lt("entry_date", endDate)
        .order("entry_date");

      if (entriesError) throw entriesError;

      const workbook = XLSX.utils.book_new();

      // Create one sheet per station
      for (const station of stations || []) {
        const stationEntries = (entries || []).filter(
          (e) => e.station_id === station.id
        );

        // Build header rows matching import format
        const headers = [
          "DATE",
          "PRODUITS",
          "ARRIVEE",
          "DEPART",
          "JAUGE DU JOUR",
          "MOMO",
          "VERSEMENT BANQUE",
          "NUM BV",
          "LIQUIDITE",
          "BONS YATT",
          "BONS CLIENTS",
        ];

        const rows: (string | number | null)[][] = [headers];

        for (const entry of stationEntries) {
          const date = entry.entry_date;
          const products = [
            {
              name: "SUPER 1",
              arrivee: entry.super1_index_arrivee,
              depart: entry.super1_index_depart,
              jauge: entry.super1_jauge,
              isFirst: true,
            },
            {
              name: "SUPER 2",
              arrivee: entry.super2_index_arrivee,
              depart: entry.super2_index_depart,
              jauge: entry.super2_jauge,
              isFirst: false,
            },
            {
              name: "GASOIL 1",
              arrivee: entry.gasoil1_index_arrivee,
              depart: entry.gasoil1_index_depart,
              jauge: entry.gasoil1_jauge,
              isFirst: false,
            },
            {
              name: "GASOIL 2",
              arrivee: entry.gasoil2_index_arrivee,
              depart: entry.gasoil2_index_depart,
              jauge: entry.gasoil2_jauge,
              isFirst: false,
            },
          ];

          for (const p of products) {
            rows.push([
              p.isFirst ? date : "",
              p.name,
              p.arrivee,
              p.depart,
              p.jauge,
              p.isFirst ? entry.versement_momo : "",
              p.isFirst ? entry.versement_banque : "",
              p.isFirst ? (entry.versement_banque_ref || "") : "",
              p.isFirst ? entry.versement_liquidite : "",
              p.isFirst ? entry.bons_carburant_valeur : "",
              p.isFirst ? entry.bons_entreprise_valeur : "",
            ]);
          }

          // Add empty separator row between days
          rows.push([]);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Set column widths
        worksheet["!cols"] = [
          { wch: 12 }, // DATE
          { wch: 12 }, // PRODUITS
          { wch: 12 }, // ARRIVEE
          { wch: 12 }, // DEPART
          { wch: 14 }, // JAUGE
          { wch: 12 }, // MOMO
          { wch: 16 }, // BANQUE
          { wch: 10 }, // NUM BV
          { wch: 12 }, // LIQUIDITE
          { wch: 12 }, // BONS YATT
          { wch: 14 }, // BONS CLIENTS
        ];

        // Truncate sheet name to 31 chars (Excel limit)
        const sheetName = station.name.substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Generate and download
      const monthNames = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
      ];
      const fileName = `SUIVI_INDEX_YATT_${monthNames[targetMonth - 1]}_${targetYear}.xlsx`;
      XLSX.writeFile(workbook, fileName);

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
