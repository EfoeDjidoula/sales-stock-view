export const DUE_SOON_DAYS = 15;
export const WARRANTY_SOON_DAYS = 30;

const dayMs = 86_400_000;
const toDay = (d: string | Date) => {
  const x = new Date(d);
  return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
};

export type DueState = "overdue" | "soon" | "ok";

/** État d'une échéance (plan préventif ou garantie) par rapport à aujourd'hui. */
export const dueState = (due: string | null | undefined, today: Date = new Date(), soonDays = DUE_SOON_DAYS): DueState | null => {
  if (!due) return null;
  const diff = Math.round((toDay(due) - toDay(today)) / dayMs);
  if (diff < 0) return "overdue";
  if (diff <= soonDays) return "soon";
  return "ok";
};

/** Disponibilité (%) = 1 − heures d'immobilisation / (nb équipements × heures de la période). */
export const availabilityPct = (assetCount: number, downtimeHours: number, periodDays: number): number => {
  if (assetCount <= 0 || periodDays <= 0) return 100;
  const total = assetCount * periodDays * 24;
  return Math.max(0, Math.min(100, Math.round((1 - downtimeHours / total) * 1000) / 10));
};
