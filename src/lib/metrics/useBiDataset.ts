import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Dataset } from "./index";

/** Charge le jeu de données BI, toujours borné au tenant actif et aux pays autorisés (RLS en plus côté serveur). */
export const useBiDataset = (tenantId: string | null | undefined, countryIds: string[], start: string, end: string, strict = false) =>
  useQuery({
    queryKey: ["bi-dataset", tenantId, countryIds, start, end, strict],
    enabled: !!tenantId && countryIds.length > 0,
    queryFn: async (): Promise<Dataset & { zones: any[]; clients: any[]; countries: string[] }> => {
      const sb = supabase as any;
      const q = (t: string, cols: string) => sb.from(t).select(cols).eq("tenant_id", tenantId).in("country_id", countryIds);
      const res = await Promise.all([
        q("stations", "id,name,country_id,zone_id,status"),
        q("petroleum_products", "id,name,code"),
        q("daily_closures", "id,station_id,closure_date,status").gte("closure_date", start).lte("closure_date", end),
        q("closure_sales", "closure_id,product_id,volume,amount"),
        q("closure_payments", "closure_id,payment_method_id,amount"),
        q("payment_methods", "id,code,kind"),
        q("index_entries", "station_id,entry_date,total_super_liters,total_gasoil_liters").gte("entry_date", start).lte("entry_date", end),
        q("stock_levels", "station_id,tank_id,product_id,theoretical,capacity,variance,alert_level"),
        q("reconciliations", "station_id,recon_date,result,volume_variance,value_variance").gte("recon_date", start).lte("recon_date", end),
        q("b2b_consumptions", "client_id,station_id,product_id,consumed_on,litres,amount").gte("consumed_on", start).lte("consumed_on", end),
        q("b2b_invoices", "id,client_id,amount,due_on"),
        q("b2b_payments", "invoice_id,amount"),
        q("price_structures", "country_id,effective_date,is_active,elements"),
        q("maintenance_assets", "id,station_id,status"),
        q("maintenance_work_orders", "asset_id,downtime_hours,labour_cost,parts_cost,completed_at,opened_at"),
        q("hse_inspections", "station_id,inspected_on,status,score"),
        q("hse_nonconformities", "station_id").eq("severity", "critical").neq("status", "closed"),
        q("perequation_zones", "id,name"),
        q("clients", "id,name,country_id"),
      ]);
      const [st] = res;
      if (st.error) throw st.error;
      if (strict) {
        // Forecasts must not interpret a failed sales/stock query as zero activity.
        for (const i of [1, 2, 3, 6, 7]) if (res[i].error) throw res[i].error;
      }
      const v = (i: number) => (res[i].error ? [] : res[i].data ?? []);
      return {
        stations: v(0), products: v(1), closures: v(2), closureSales: v(3), closurePayments: v(4), paymentMethods: v(5),
        entries: v(6), levels: v(7), recons: v(8), consumptions: v(9), invoices: v(10), payments: v(11), priceStructures: v(12),
        assets: v(13), workOrders: v(14), inspections: v(15), criticalNc: v(16), zones: v(17), clients: v(18), countries: countryIds,
      };
    },
  });
