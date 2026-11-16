import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { openStoredFile } from "@/lib/storageFiles";

const BUCKET = "contract-documents";

/** Téléverse un document de contrat et renvoie son chemin de stockage (tenant/…). */
export const uploadContractDocument = async (tenantId: string, file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
};

/** Ouvre un document : lien externe tel quel, fichier stocké lu avec la session (aucun lien signé). */
export const openContractDocument = async (value: string) => {
  if (/^https?:\/\//i.test(value)) { window.open(value, "_blank", "noopener"); return; }
  const ok = await openStoredFile(BUCKET, value);
  if (!ok) toast.error("Impossible d'ouvrir le document");
};
