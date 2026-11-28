export const BL_ROLES = ["shipper", "carrier", "consignee"] as const;
export type BlRole = typeof BL_ROLES[number];
export const BL_ROLE_LABEL: Record<BlRole, string> = { shipper: "Responsable logistique", carrier: "Chauffeur", consignee: "Destinataire" };
export interface BlSignature { role: BlRole; signed_by: string; signer_name: string; signature_png: string; signed_at: string; decision: string; reserves: string | null }
export interface DeliveryNote {
  id: string; number: string; trip_id: string; tenant_id: string; country_id: string; created_at: string; trip_status: string;
  shipper_user: string | null; carrier_user: string | null; consignee_user: string | null;
  station_id?: string | null; client_id?: string | null;
  /** Quantité réellement dépotée par load_id (jauge cuve, sinon livraison confirmée). */
  received?: Record<string, number>;
  snapshot: { site: string; trip: string; be: string | null; truck: string; tanker: string | null; driver: string; license: string | null; loaded_at: string; seals: string[]; brand: import("./branding").BrandIdentity; lines: { load_id: string; product: string; compartment: number | null; litres: number }[] };
  signatures: BlSignature[]; events: { action: string; created_at: string; actor: string | null; details: { role?: BlRole; decision?: string } }[];
}
/** Gérant pour une station, responsable de site/chantier pour un client B2B. */
export function consigneeLabel(note: Pick<DeliveryNote, "station_id">) {
  return note.station_id ? "Gérant de station" : "Responsable de site / chantier";
}
export function roleLabel(note: Pick<DeliveryNote, "station_id">, role: BlRole) {
  return role === "consignee" ? consigneeLabel(note) : BL_ROLE_LABEL[role];
}
export function signatureProgress(signatures: BlSignature[]) {
  return BL_ROLES.filter(role => signatures.some(s => s.role === role)).length;
}
/**
 * Prochaine signature possible pour l'utilisateur. Le chauffeur n'a pas de compte :
 * sa signature est recueillie sur l'appareil du destinataire désigné, du responsable logistique
 * ou d'un utilisateur habilité sur site (canCollectDriver).
 */
export function nextSignatureRole(note: DeliveryNote, userId: string, canCollectDriver = false): BlRole | null {
  if (note.trip_status === "cancelled") return null;
  const role = BL_ROLES.find(r => !note.signatures.some(s => s.role === r));
  if (!role) return null;
  if (role === "carrier") return canCollectDriver || note.consignee_user === userId || note.shipper_user === userId ? role : null;
  return note[`${role}_user`] === userId ? role : null;
}
export function blDecision(signatures: BlSignature[]) {
  return signatures.find(s => s.role === "consignee")?.decision ?? "pending";
}
export interface BlLineQty { load_id: string; product: string; compartment: number | null; litres: number; received: number | null; variance: number | null; variancePct: number | null }
/** Écart chauffeur = quantité dépotée − volume BL (négatif = manquant). */
export function blQuantities(note: Pick<DeliveryNote, "snapshot" | "received">) {
  const lines: BlLineQty[] = note.snapshot.lines.map((l) => {
    const r = note.received?.[l.load_id];
    const received = r === undefined || r === null ? null : Number(r);
    const variance = received === null ? null : Math.round((received - Number(l.litres)) * 10) / 10;
    return { ...l, litres: Number(l.litres), received, variance, variancePct: variance === null || !Number(l.litres) ? null : Math.round((variance / Number(l.litres)) * 10000) / 100 };
  });
  const bl = lines.reduce((s, l) => s + l.litres, 0);
  const complete = lines.length > 0 && lines.every((l) => l.received !== null);
  const received = lines.some((l) => l.received !== null) ? lines.reduce((s, l) => s + (l.received ?? 0), 0) : null;
  const variance = complete && received !== null ? Math.round((received - bl) * 10) / 10 : null;
  return { lines, bl, received, complete, variance };
}
export function varianceLabel(v: number | null) {
  if (v === null) return "—";
  return v < 0 ? "Manquant" : v > 0 ? "Excédent" : "Conforme";
}
