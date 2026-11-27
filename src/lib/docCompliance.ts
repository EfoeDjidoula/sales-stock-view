// Regulatory document compliance for trucks and drivers (read-only, pure).
export const VEHICLE_REQUIRED_DOCS = ["Assurance", "Visite technique", "Carte grise"];
export const DRIVER_REQUIRED_DOCS = ["Permis poids lourd", "Attestation ADR"];
export const DUE_SOON_DAYS = 30;
export const URGENT_DAYS = 15;

export type DocState = "expired" | "urgent" | "due_soon" | "valid" | "missing";
export type Doc = { id?: string; doc_type?: string; doc_number?: string | null; expires_on?: string | null; vehicle_id?: string | null; driver_id?: string | null };
export const DOC_TONE: Record<DocState, "destructive" | "warning" | "success" | "muted-foreground"> = {
  expired: "destructive", urgent: "destructive", due_soon: "warning", valid: "success", missing: "muted-foreground",
};

export const daysLeft = (exp: string, today: string) =>
  Math.round((Date.parse(exp + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);

export function docState(exp: string | null | undefined, today: string): DocState {
  if (!exp || !Number.isFinite(Date.parse(exp + "T00:00:00Z"))) return "missing";
  const d = daysLeft(exp, today);
  if (d < 0) return "expired";
  if (d <= URGENT_DAYS) return "urgent";
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
  const rank: Record<DocState, number> = { expired: 4, missing: 3, urgent: 2, due_soon: 1, valid: 0 };
  const worst = cells.reduce<DocState>((w, c) => (rank[c.state] > rank[w] ? c.state : w), "valid");
  return { cells, worst, blocked: worst === "expired" || worst === "missing" };
}

export type DocumentGroup = "all" | "vehicles" | "drivers";
export type DocumentReportRow = {
  entity: "vehicles" | "drivers"; name: string; type: string; number: string;
  expiresOn: string | null; days: number | null; state: DocState; missingDocument: boolean;
};
type Entity = { id?: string; registration?: string; full_name?: string; status?: string };

/** Only uses entities/documents already scoped by the caller; includes missing required pieces. */
export function documentReportRows(docs: Doc[], vehicles: Entity[], drivers: Entity[], today: string): DocumentReportRow[] {
  const rows: DocumentReportRow[] = [];
  const add = (entities: Entity[], entity: "vehicles" | "drivers", key: "vehicle_id" | "driver_id", required: string[]) => {
    for (const e of entities) {
      if (!e.id) continue;
      const mine = docs.filter((doc) => doc[key] === e.id);
      const name = (entity === "vehicles" ? e.registration : e.full_name) || e.id;
      for (const doc of mine) {
        const state = docState(doc.expires_on, today);
        rows.push({ entity, name, type: doc.doc_type || "—", number: doc.doc_number || "—", expiresOn: doc.expires_on || null,
          days: state === "missing" ? null : daysLeft(String(doc.expires_on), today), state, missingDocument: false });
      }
      for (const type of required.filter((t) => !mine.some((doc) => doc.doc_type === t))) {
        rows.push({ entity, name, type, number: "—", expiresOn: null, days: null, state: "missing", missingDocument: true });
      }
    }
  };
  add(vehicles, "vehicles", "vehicle_id", VEHICLE_REQUIRED_DOCS);
  add(drivers, "drivers", "driver_id", DRIVER_REQUIRED_DOCS);
  return rows.sort((a, b) => a.entity.localeCompare(b.entity) || a.name.localeCompare(b.name) || (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999") || a.type.localeCompare(b.type));
}

export function filterDocumentReport(rows: DocumentReportRow[], group: DocumentGroup, state: "all" | DocState, query: string) {
  const q = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (group === "all" || row.entity === group) && (state === "all" || row.state === state)
    && `${row.name} ${row.type} ${row.number}`.toLocaleLowerCase().includes(q));
}
