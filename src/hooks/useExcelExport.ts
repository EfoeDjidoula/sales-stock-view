import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

      const workbook = new ExcelJS.Workbook();

      for (const station of stations || []) {
        const stationEntries = (entries || []).filter(
          (e) => e.station_id === station.id
        );

        const sheetName = station.name.substring(0, 31);
        const worksheet = workbook.addWorksheet(sheetName);

        // Add header rows
        worksheet.addRow(HEADERS_ROW_1);
        worksheet.addRow(HEADERS_ROW_2);

        for (const entry of stationEntries) {
          const [y, m, d] = entry.entry_date.split("-");
          const dateStr = `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;

          const super1Qty = entry.super1_index_arrivee - entry.super1_index_depart;
          const super2Qty = entry.super2_index_arrivee - entry.super2_index_depart;
          const gasoil1Qty = entry.gasoil1_index_arrivee - entry.gasoil1_index_depart;
          const gasoil2Qty = entry.gasoil2_index_arrivee - entry.gasoil2_index_depart;
          const totalSuper = super1Qty + super2Qty;
          const totalGasoil = gasoil1Qty + gasoil2Qty;
          const superAmount = totalSuper * 695;
          const gasoilAmount = totalGasoil * 720;
          const totalAmount = superAmount + gasoilAmount;

          const dash = (v: number) => (v > 0 ? v : "-");

          const productRows = [
            [dateStr, "SUPER 1",
              entry.super1_index_arrivee, entry.super1_index_depart,
              dash(super1Qty), dash(totalSuper), "", dash(totalSuper),
              695, dash(superAmount),
              entry.bons_carburant_valeur || "", entry.bons_entreprise_valeur || "", "", "",
              dash(totalAmount),
              entry.versement_momo || "", entry.versement_liquidite || "",
              entry.versement_banque || "", "",
              "", entry.versement_banque_ref || "",
              "SUPER (1)", entry.super1_jauge || "", "", "", "", "",
              dash(totalSuper), "", entry.super1_jauge || "", "",
            ],
            ["", "SUPER 2",
              entry.super2_index_arrivee || "", entry.super2_index_depart || "",
              dash(super2Qty),
              ...Array(26).fill(""),
            ],
            ["", "SUPER 3", "", "", "-", "", "", "",
              "", "", "", "", "", "", "", "", "", "", "", "", "",
              "SUPER (2)", entry.super2_jauge || "", "", "", "", "",
              "", "", entry.super2_jauge || "", "",
            ],
            ["", "SUPER 4", "", "", "-", ...Array(26).fill("")],
            ["", "GASOIL 1",
              entry.gasoil1_index_arrivee, entry.gasoil1_index_depart,
              dash(gasoil1Qty), dash(totalGasoil), "", dash(totalGasoil),
              720, dash(gasoilAmount),
              "", "", "", "", "", "", "", "", "", "", "",
              "GASOIL (1)", entry.gasoil1_jauge || "", "", "", "", "",
              dash(totalGasoil), "", entry.gasoil1_jauge || "", "",
            ],
            ["", "GASOIL 2",
              entry.gasoil2_index_arrivee || "", entry.gasoil2_index_depart || "",
              dash(gasoil2Qty),
              ...Array(26).fill(""),
            ],
            ["", "GASOIL 3", "", "", "-", "", "", "",
              "", "", "GASOIL (2)", entry.gasoil2_jauge || "", "", "", "", "", "", "", "", "", "",
              "", "", "", "", "", "",
              "", "", entry.gasoil2_jauge || "", "",
            ],
            ["", "GASOIL 4", "", "", "-", ...Array(26).fill("")],
            ["", "TOTAL", "", "", "", "", "", "",
              "", dash(totalAmount),
              entry.bons_carburant_valeur || "", entry.bons_entreprise_valeur || "", "", "",
              dash(totalAmount),
              entry.versement_momo || "", entry.versement_liquidite || "",
              entry.versement_banque || "", "", "", "",
              "", "", "", "", "", "", "", "", "", "",
            ],
          ];

          for (const row of productRows) {
            worksheet.addRow(row);
          }
        }

        // Set column widths
        worksheet.columns = Array(31).fill(null).map((_, i) => ({
          width: i === 0 ? 10 : i === 1 ? 12 : (i === 2 || i === 3) ? 14 : 12,
        }));
      }

      const fileName = `SUIVI_DES_INDEX_DES_STATIONS_YATT_CO_ENERGY_BENIN_${targetYear}_${targetMonth}.xlsx`;

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
