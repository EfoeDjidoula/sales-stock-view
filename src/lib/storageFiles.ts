import { supabase } from "@/integrations/supabase/client";

/** Types affichables sans risque dans un onglet (aucun script exécutable). */
const INLINE_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain",
]);

/**
 * Ouvre un fichier stocké sans créer de lien partageable :
 * le fichier est téléchargé avec la session de l'utilisateur (droits vérifiés côté serveur
 * à chaque ouverture), puis affiché depuis la mémoire du navigateur.
 * Les formats potentiellement actifs (HTML, SVG…) sont téléchargés, jamais affichés.
 */
export const openStoredFile = async (bucket: string, path: string, fileName?: string): Promise<boolean> => {
  const w = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) { w?.close(); return false; }
  const type = (data.type || "").split(";")[0].trim().toLowerCase();
  const name = fileName || path.split("/").pop() || "document";
  if (INLINE_TYPES.has(type)) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    if (w) w.location.href = url; else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    w?.close();
    const url = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return true;
};
