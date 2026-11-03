import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";

/** Active vehicles of the logistics fleet, shaped like the legacy Truck for depotage forms. */
export interface FleetVehicle {
  id: string;
  registration: string;
  driver_name: string;
  nominal_capacity: number;
  compartments: number[];
}

export const useFleetVehicles = () => {
  const { scopeQuery, tenantId, countryId } = useScope();
  const [trucks, setTrucks] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      const db = supabase as any;
      const [v, c] = await Promise.all([
        scopeQuery(db.from("logistics_vehicles").select("id,registration,capacity_litres,status")).order("registration"),
        scopeQuery(db.from("logistics_compartments").select("vehicle_id,position,capacity_litres")).order("position"),
      ]);
      if (cancel) return;
      const comps = (c.data ?? []) as any[];
      setTrucks(((v.data ?? []) as any[]).filter((x) => x.status !== "inactive").map((x) => ({
        id: x.id,
        registration: x.registration,
        driver_name: "",
        nominal_capacity: Number(x.capacity_litres) || 0,
        compartments: comps.filter((k) => k.vehicle_id === x.id).map((k) => Number(k.capacity_litres) || 0),
      })));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [tenantId, countryId, scopeQuery]);

  return { trucks, loading };
};
