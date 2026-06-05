import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Récupère le stock (jauge) le plus récent d'une cuve précise.
 * Les jauges sont stockées dans des colonnes héritées d'index_entries ;
 * on reproduit l'ordre des cuves configurées par type de produit pour
 * retrouver la valeur correspondant à la cuve sélectionnée.
 */
export const useTankLatestStock = (
  stationId?: string,
  tankId?: string | null,
  productType?: "super" | "gasoil"
) => {
  const [stock, setStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!stationId || !tankId || !productType) {
        setStock(null);
        return;
      }
      setLoading(true);
      try {
        const { data: tanksData } = await supabase
          .from("tanks")
          .select("id, product_type")
          .eq("station_id", stationId)
          .order("product_type")
          .order("name");
        const sameProduct = (tanksData || []).filter(
          (t) => t.product_type === productType
        );
        const idx = sameProduct.findIndex((t) => t.id === tankId);

        const { data: entry } = await supabase
          .from("index_entries")
          .select(
            "super1_jauge, super2_jauge, gasoil1_jauge, gasoil2_jauge"
          )
          .eq("station_id", stationId)
          .or("super1_jauge.gt.0,super2_jauge.gt.0,gasoil1_jauge.gt.0,gasoil2_jauge.gt.0")
          .order("entry_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        let value = 0;
        if (entry) {
          const cols =
            productType === "super"
              ? [entry.super1_jauge, entry.super2_jauge]
              : [entry.gasoil1_jauge, entry.gasoil2_jauge];
          value = Number(cols[idx >= 0 ? idx : 0]) || 0;
        }
        if (active) setStock(value);
      } catch (e) {
        console.error("Error fetching tank stock:", e);
        if (active) setStock(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [stationId, tankId, productType]);

  return { stock, loading };
};
