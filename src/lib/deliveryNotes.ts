export const BL_ROLES = ["shipper", "carrier", "consignee"] as const;
export type BlRole = typeof BL_ROLES[number];
export const BL_ROLE_LABEL: Record<BlRole, string> = { shipper: "Responsable logistique", carrier: "Chauffeur", consignee: "Destinataire" };
export interface BlSignature { role: BlRole; signed_by: string; signer_name: string; signature_png: string; signed_at: string; decision: string; reserves: string | null }
export interface DeliveryNote {
  id: string; number: string; trip_id: string; tenant_id: string; country_id: string; created_at: string; trip_status: string;
  shipper_user: string | null; carrier_user: string | null; consignee_user: string | null;
  snapshot: { site: string; trip: string; be: string | null; truck: string; tanker: string | null; driver: string; license: string | null; loaded_at: string; seals: string[]; brand: import("./branding").BrandIdentity; lines: { load_id: string; product: string; compartment: number | null; litres: number }[] };
  signatures: BlSignature[]; events: { action: string; created_at: string; actor: string | null; details: { role?: BlRole; decision?: string } }[];
}
export function signatureProgress(signatures: BlSignature[]) {
  return BL_ROLES.filter(role => signatures.some(s => s.role === role)).length;
}
export function nextSignatureRole(note: DeliveryNote, userId: string): BlRole | null {
  if (note.trip_status === "cancelled") return null;
  const role = BL_ROLES.find(r => !note.signatures.some(s => s.role === r));
  return role && note[`${role}_user`] === userId ? role : null;
}
export function blDecision(signatures: BlSignature[]) {
  return signatures.find(s => s.role === "consignee")?.decision ?? "pending";
}