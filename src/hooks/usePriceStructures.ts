import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ExcelJS from "exceljs";

export interface PriceElement {
  label: string;
  super: number | null;
  gasoil: number | null;
}

export interface PriceStructure {
  id: string;
  user_id: string;
  country: string;
  effective_date: string;
  label: string | null;
  super_price: number;
  gasoil_price: number;
  elements: PriceElement[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParsedPriceStructure {
  effective_date: string;
  super_price: number;
  gasoil_price: number;
  elements: PriceElement[];
}

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "result" in (value as any)) {
    return parseNumber((value as any).result);
  }
  const cleaned = String(value).replace(/[\s ]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

const formatDate = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // dd/mm/yy or dd/mm/yyyy
  const str = String(value).trim();
  const match = str.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
};

// Row labels that represent the final official selling price
const SELLING_PRICE_LABELS = [
  "PRIX OFFICIEL DETAIL EN FCFA",
  "PRIX DE CESSION SUBVENTIONNE A LA POMPE",
  "TOTAL PRIX CESSION POMPE TTC EN LITRE",
];

export const parsePriceStructureFile = async (file: File): Promise<ParsedPriceStructure> => {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Aucune feuille trouvée dans le fichier.");

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values as unknown[];
    // ExcelJS row.values is 1-indexed; drop the first empty slot
    rows.push(values.slice(1));
  });

  // Find header row: col 0 === "ELEMENTS STRUCTURE"
  let headerIdx = rows.findIndex(
    (r) => String(r[0] ?? "").trim().toUpperCase() === "ELEMENTS STRUCTURE"
  );
  if (headerIdx === -1) {
    throw new Error("Format non reconnu : ligne d'en-tête 'ELEMENTS STRUCTURE' introuvable.");
  }

  // Effective date: search rows above header for a date value
  let effective_date: string | null = null;
  for (let i = headerIdx - 1; i >= 0 && i >= headerIdx - 4; i--) {
    for (const cell of rows[i]) {
      const d = formatDate(cell);
      if (d) {
        effective_date = d;
        break;
      }
    }
    if (effective_date) break;
  }
  // Fallback: date encoded in filename (e.g. _du_30_04_2026)
  if (!effective_date) {
    const fm = file.name.match(/(\d{1,2})[_/-](\d{1,2})[_/-](\d{2,4})/);
    if (fm) {
      let [, d, m, y] = fm;
      if (y.length === 2) y = `20${y}`;
      effective_date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  if (!effective_date) {
    throw new Error("Date d'application introuvable dans le fichier.");
  }

  const elements: PriceElement[] = [];
  let super_price = 0;
  let gasoil_price = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const label = String(rows[i][0] ?? "").trim();
    if (!label) continue;
    const sup = parseNumber(rows[i][1]);
    const gas = parseNumber(rows[i][2]);
    elements.push({ label, super: sup, gasoil: gas });

    if (SELLING_PRICE_LABELS.includes(label.toUpperCase())) {
      if (sup != null) super_price = sup;
      if (gas != null) gasoil_price = gas;
    }
  }

  if (super_price === 0 && gasoil_price === 0) {
    throw new Error("Prix de vente (Super / Gasoil) introuvables dans le fichier.");
  }

  return { effective_date, super_price, gasoil_price, elements };
};

export const usePriceStructures = () => {
  const { user } = useAuth();
  const [structures, setStructures] = useState<PriceStructure[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStructures = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("price_structures")
        .select("*")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      setStructures((data || []) as unknown as PriceStructure[]);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des structures de prix");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const importStructure = async (parsed: ParsedPriceStructure, label?: string) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("price_structures")
        .upsert(
          {
            user_id: user.id,
            country: "BJ",
            effective_date: parsed.effective_date,
            label: label ?? null,
            super_price: parsed.super_price,
            gasoil_price: parsed.gasoil_price,
            elements: parsed.elements as unknown as any,
            is_active: true,
          },
          { onConflict: "country,effective_date" }
        )
        .select()
        .single();
      if (error) throw error;
      toast.success("Structure de prix importée avec succès");
      await fetchStructures();
      return data;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de l'import");
      console.error(error);
      return null;
    }
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    try {
      // Prevent activating a duplicate for the same period
      if (is_active) {
        const target = structures.find((s) => s.id === id);
        const duplicate =
          target &&
          structures.find(
            (s) =>
              s.id !== id &&
              s.is_active &&
              s.country === target.country &&
              s.effective_date === target.effective_date
          );
        if (duplicate) {
          toast.error("Activation impossible", {
            description: `Une structure est déjà active pour la période du ${new Date(
              target!.effective_date + "T00:00:00"
            ).toLocaleDateString("fr-FR")}.`,
          });
          return false;
        }
      }
      const { error } = await supabase.from("price_structures").update({ is_active }).eq("id", id);
      if (error) throw error;
      toast.success(is_active ? "Structure activée" : "Structure désactivée");
      await fetchStructures();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la mise à jour");
      console.error(error);
      return false;
    }
  };

  const deleteStructure = async (id: string) => {
    try {
      const { error } = await supabase.from("price_structures").delete().eq("id", id);
      if (error) throw error;
      toast.success("Structure de prix supprimée");
      await fetchStructures();
    } catch (error: any) {
      toast.error("Erreur lors de la suppression");
      console.error(error);
    }
  };

  useEffect(() => {
    fetchStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { structures, loading, importStructure, toggleActive, deleteStructure, refetch: fetchStructures };
};
