/**
 * Logo / favicon importés depuis un fichier local (glisser-déposer ou sélection).
 * Le type est reconnu par signature binaire (jamais par l'extension), puis l'image est
 * redessinée en PNG compact : aucun contenu actif (SVG, script) n'est conservé.
 */
export type BrandImageKind = "logo" | "favicon";
export type BrandImageType = "png" | "jpeg" | "webp" | "gif" | "ico";

export const BRAND_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BRAND_IMAGE_MAX_SIDE: Record<BrandImageKind, number> = { logo: 512, favicon: 64 };
export const BRAND_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon,.ico";

export const detectBrandImageType = (b: Uint8Array): BrandImageType | null => {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "ico";
  return null;
};

/** Message d'erreur en français, ou null si le fichier est accepté. */
export const validateBrandFile = (size: number, bytes: Uint8Array): string | null => {
  if (size <= 0) return "Fichier vide";
  if (size > BRAND_IMAGE_MAX_BYTES) return "Fichier trop lourd (2 Mo maximum)";
  if (!detectBrandImageType(bytes)) return "Format non pris en charge : utilisez PNG, JPEG, WebP, GIF ou ICO";
  return null;
};

/** Dimensions réduites pour tenir dans un carré de `max` px, sans agrandir ni déformer. */
export const fitWithin = (w: number, h: number, max: number): { w: number; h: number } => {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const ratio = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
};

export const isEmbeddedImage = (value: string | null | undefined) => !!value && value.startsWith("data:image/");

/** Lit, contrôle et convertit le fichier en PNG (data URL) prêt à être enregistré. */
export const prepareBrandImage = async (file: File, kind: BrandImageKind): Promise<string> => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const err = validateBrandFile(file.size, bytes);
  if (err) throw new Error(err);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image illisible"));
      i.src = url;
    });
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, BRAND_IMAGE_MAX_SIDE[kind]);
    if (!w || !h) throw new Error("Image illisible");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion impossible");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
};
