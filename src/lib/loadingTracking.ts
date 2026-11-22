/** Phase 3 — suivi des chargements : statut opérationnel dérivé (lecture seule). */
export type LoadingStage = "waiting" | "loading" | "loaded" | "en_route" | "partial" | "delivered" | "closed" | "incident" | "cancelled";

export const LOADING_STAGES: Record<LoadingStage, [string, string]> = {
  waiting: ["En attente", "Waiting"], loading: ["En cours", "Loading"], loaded: ["Chargé", "Loaded"],
  en_route: ["En route", "En route"], partial: ["Partiellement livré", "Partially delivered"],
  delivered: ["Livré en totalité", "Fully delivered"], closed: ["Clôturé", "Closed"],
  incident: ["Incident", "Incident"], cancelled: ["Annulé", "Cancelled"],
};

export interface StageInput {
  status: string;
  qtyLoaded?: number | null;
  qtyDelivered?: number | null;
  sitesTotal: number;   // destinations planned
  sitesDone: number;    // destinations confirmed
  openVariance: boolean; // quantity_variance alert still open
}

export function loadingStage(t: StageInput): LoadingStage {
  switch (t.status) {
    case "cancelled": return "cancelled";
    case "incident": return "incident";
    case "planned": return "waiting";
    case "loading": return "loading";
    case "loaded": return "loaded";
    case "in_transit": return "en_route";
    case "arrived": case "unloading": return t.sitesDone > 0 ? "partial" : "en_route";
    case "delivered": {
      const loaded = Number(t.qtyLoaded ?? 0), deliv = Number(t.qtyDelivered ?? 0);
      const conform = loaded > 0 && deliv === loaded;
      return conform || (!t.openVariance && t.qtyDelivered != null) ? "closed" : "delivered";
    }
    default: return "waiting";
  }
}

export interface TrackingFilter {
  from?: string; to?: string; depotId?: string; vehicleId?: string; driverId?: string;
  productId?: string; destId?: string; stage?: string;
}
export interface TrackingRow {
  date: string; depotId?: string | null; vehicleIds: string[]; driverId?: string | null;
  productIds: string[]; destIds: string[]; stage: LoadingStage;
}
export function matchesFilter(r: TrackingRow, f: TrackingFilter): boolean {
  const day = r.date.slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  if (f.depotId && r.depotId !== f.depotId) return false;
  if (f.vehicleId && !r.vehicleIds.includes(f.vehicleId)) return false;
  if (f.driverId && r.driverId !== f.driverId) return false;
  if (f.productId && !r.productIds.includes(f.productId)) return false;
  if (f.destId && !r.destIds.includes(f.destId)) return false;
  if (f.stage && r.stage !== f.stage) return false;
  return true;
}
