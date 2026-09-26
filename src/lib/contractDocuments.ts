import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "contract-documents";

/** Téléverse un document de contrat et renvoie son chemin de stockage (tenant/…). */
export const uploadContractDocument = async (tenantId: string, file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
};

/** Ouvre un document : lien externe tel quel, fichier stocké via lien signé temporaire. */
export const openContractDocument = async (value: string) => {
  if (/^https?:\/\//i.test(value)) { window.open(value, "_blank", "noopener"); return; }
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value, 600);
  if (error || !data) { w?.close(); toast.error("Impossible d'ouvrir le document"); return; }
  if (w) w.location.href = data.signedUrl; else window.open(data.signedUrl, "_blank");
};
