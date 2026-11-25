// Phase 6 — répartition BE / BL (lecture seule).
export type AllocStatus = "conform" | "unallocated" | "surplus" | "short_delivered";
export interface AllocLine { productId: string; lifted: number; allocated: number; delivered: number; status: AllocStatus }

const TOL = 0.5;
export function allocationStatus(lifted: number, allocated: number, delivered: number, deliveredDone: boolean): AllocStatus {
  if (allocated - lifted > TOL) return "surplus";
  if (lifted - allocated > TOL) return "unallocated";
  if (deliveredDone && allocated - delivered > TOL) return "short_delivered";
  return "conform";
}

export function allocateBe(
  beLines: { product_id: string; qty_litres: number }[],
  loads: { id: string; product_id: string; qty_litres: number }[],
  deliveries: { load_id: string; qty_delivered: number }[],
  deliveredDone: boolean,
): AllocLine[] {
  const ids = [...new Set([...beLines.map((l) => l.product_id), ...loads.map((l) => l.product_id)])];
  return ids.map((productId) => {
    const lifted = beLines.filter((l) => l.product_id === productId).reduce((s, l) => s + Number(l.qty_litres || 0), 0);
    const pl = loads.filter((l) => l.product_id === productId);
    const allocated = pl.reduce((s, l) => s + Number(l.qty_litres || 0), 0);
    const loadIds = new Set(pl.map((l) => l.id));
    const delivered = deliveries.filter((x) => loadIds.has(x.load_id)).reduce((s, x) => s + Number(x.qty_delivered || 0), 0);
    return { productId, lifted, allocated, delivered, status: allocationStatus(lifted, allocated, delivered, deliveredDone) };
  });
}

export const worstStatus = (lines: AllocLine[]): AllocStatus =>
  (["surplus", "unallocated", "short_delivered"] as AllocStatus[]).find((s) => lines.some((l) => l.status === s)) ?? "conform";
