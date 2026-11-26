// Regulatory document compliance for trucks and drivers (read-only, pure).
export const VEHICLE_REQUIRED_DOCS = ["Assurance", "Visite technique", "Carte grise"];
export const DRIVER_REQUIRED_DOCS = ["Permis poids lourd", "Attestation ADR"];
export const DUE_SOON_DAYS = 30;

export type DocState = "expired" | "due_soon" | "valid" | "missing";
type Doc = { doc_type?: string; expires_on?: string | null; vehicle_id?: string | null; driver_id?: string | null };

export const daysLeft = (exp: string, today: string) =>
  Math.round((Date.parse(exp + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);

export function docState(exp: string | null | undefined, today: string): DocState {
  if (!exp) return "missing";
  const d = daysLeft(exp, today);
  if (d < 0) return "expired";
  return d <= DUE_SOON_DAYS ? "due_soon" : "valid";
}

export type ComplianceCell = { type: string; state: DocState; expires_on?: string | null; days?: number };

/** One row per entity: latest document per required type, worst state wins. */
export function entityCompliance(docs: Doc[], key: "vehicle_id" | "driver_id", id: string, required: string[], today: string) {
  const mine = docs.filter((x) => x[key] === id);
  const cells: ComplianceCell[] = required.map((type) => {
    const latest = mine.filter((x) => x.doc_type === type && x.expires_on).sort((a, b) => String(b.expires_on).localeCompare(String(a.expires_on)))[0];
    if (!latest) return { type, state: "missing" };
    return { type, state: docState(latest.expires_on, today), expires_on: latest.expires_on, days: daysLeft(String(latest.expires_on), today) };
  });
  const rank: Record<DocState, number> = { expired: 3, missing: 2, due_soon: 1, valid: 0 };
  const worst = cells.reduce<DocState>((w, c) => (rank[c.state] > rank[w] ? c.state : w), "valid");
  return { cells, worst, blocked: worst === "expired" || worst === "missing" };
}
