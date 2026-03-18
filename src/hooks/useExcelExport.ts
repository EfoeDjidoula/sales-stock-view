import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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

const PRODUCTS = [
  "SUPER 1", "SUPER 2", "SUPER 3", "SUPER 4",
  "GASOIL 1", "GASOIL 2", "GASOIL 3", "GASOIL 4",
  "TOTAL",
];

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
      const { data: stations, error: stationsError } = await supabase
        .from("stations")
        .select("id, name")
        .order("name");

      if (stationsError) throw stationsError;

      const now = new Date();
      const targetYear = year ?? now.getFullYear();
      const targetMonth = month ?? now.getMonth() + 1;
      const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
      const endDate = targetMonth === 12
        ? `${targetYear + 1}-01-01`
        : `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`;

      const { data: entries, error: entriesError } = await supabase
        .from("index_entries")
        .select("*")
        .gte("entry_date", startDate)
        .lt("entry_date", endDate)
        .order("entry_date");

      if (entriesError) throw entriesError;

      const workbook = XLSX.utils.book_new();

      for (const station of stations || []) {
        const stationEntries = (entries || []).filter(
          (e) => e.station_id === station.id
        );

        const rows: (string | number | null)[][] = [
          HEADERS_ROW_1,
          HEADERS_ROW_2,
        ];

        for (const entry of stationEntries) {
          // Format date as M/D/YY
          const [y, m, d] = entry.entry_date.split("-");
          const dateStr = `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;

          // Calculate quantities
          const super1Qty = entry.super1_index_arrivee - entry.super1_index_depart;
          const super2Qty = entry.super2_index_arrivee - entry.super2_index_depart;
          const gasoil1Qty = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
          const gasoil2Qty = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
          const totalSuper = super1Qty + super2Qty;
          const totalGasoil = gasoil1Qty + gasoil2Qty;
          const superAmount = totalSuper * 695;
          const gasoilAmount = totalGasoil * 720;
          const totalAmount = superAmount + gasoilAmount;

          const productRows: (string | number | null)[][] = [
            // SUPER 1 - includes versements/bons data
            [dateStr, "SUPER 1",
              entry.super1_index_arrivee, entry.super1_index_depart,
              super1Qty > 0 ? super1Qty : "-",
              totalSuper > 0 ? totalSuper : "-", "", totalSuper > 0 ? totalSuper : "-",
              695, superAmount > 0 ? superAmount : "-",
              entry.bons_carburant_valeur || "", entry.bons_entreprise_valeur || "", "", "",
              totalAmount > 0 ? totalAmount : "-",
              entry.versement_momo || "", entry.versement_liquidite || "",
              entry.versement_banque || "", "",
              "", entry.versement_banque_ref || "",
              `SUPER (1)`, entry.super1_jauge || "", "", "", "", "",
              totalSuper > 0 ? totalSuper : "-", "", entry.super1_jauge || "", "",
            ],
            // SUPER 2
            ["", "SUPER 2",
              entry.super2_index_arrivee || "", entry.super2_index_depart || "",
              super2Qty > 0 ? super2Qty : "-",
              ...Array(26).fill(""),
            ],
            // SUPER 3 (empty if no data)
            ["", "SUPER 3", "", "", "-", "", "", "",
              "", "", "", "", "", "", "", "", "", "", "", "", "",
              `SUPER (2)`, entry.super2_jauge || "", "", "", "", "",
              "", "", entry.super2_jauge || "", "",
            ],
            // SUPER 4
            ["", "SUPER 4", "", "", "-", ...Array(26).fill("")],
            // GASOIL 1
            ["", "GASOIL 1",
              entry.gasoil1_index_arrivee, entry.gasoil1_index_depart,
              gasoil1Qty > 0 ? gasoil1Qty : "-",
              totalGasoil > 0 ? totalGasoil : "-", "", totalGasoil > 0 ? totalGasoil : "-",
              720, gasoilAmount > 0 ? gasoilAmount : "-",
              "", "", "", "", "", "", "", "", "", "", "",
              `GASOIL (1)`, entry.gasoil1_jauge || "", "", "", "", "",
              totalGasoil > 0 ? totalGasoil : "-", "", entry.gasoil1_jauge || "", "",
            ],
            // GASOIL 2
            ["", "GASOIL 2",
              entry.gasoil2_index_arrivee || "", entry.gasoil2_index_depart || "",
              gasoil2Qty > 0 ? gasoil2Qty : "-",
              ...Array(26).fill(""),
            ],
            // GASOIL 3
            ["", "GASOIL 3", "", "", "-", "", "", "",
              "", "", `GASOIL (2)`, entry.gasoil2_jauge || "", "", "", "", "", "", "", "", "", "",
              "", "", "", "", "", "",
              "", "", entry.gasoil2_jauge || "", "",
            ],
            // GASOIL 4
            ["", "GASOIL 4", "", "", "-", ...Array(26).fill("")],
            // TOTAL
            ["", "TOTAL", "", "", "", "", "", "",
              "", totalAmount > 0 ? totalAmount : "-",
              entry.bons_carburant_valeur || "", entry.bons_entreprise_valeur || "", "", "",
              totalAmount > 0 ? totalAmount : "-",
              entry.versement_momo || "", entry.versement_liquidite || "",
              entry.versement_banque || "", "", "", "",
              "", "", "", "", "", "", "", "", "", "",
            ],
          ];

          rows.push(...productRows);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Set column widths
        worksheet["!cols"] = Array(31).fill(null).map((_, i) => {
          if (i === 0) return { wch: 10 };
          if (i === 1) return { wch: 12 };
          if (i === 2 || i === 3) return { wch: 14 };
          return { wch: 12 };
        });

        const sheetName = station.name.substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      const monthNames = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
      ];
      const fileName = `SUIVI_DES_INDEX_DES_STATIONS_YATT_CO_ENERGY_BENIN_${targetYear}_${targetMonth}.xlsx`;
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
