/**
 * Identité visuelle "white label".
 * Un store module-level permet aux générateurs de documents (PDF, Excel)
 * d'utiliser l'identité de la société active sans dépendre de React.
 */

export interface BrandIdentity {
  tenantId: string | null;
  companyName: string;
  legalName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string; // HSL "38 92% 50%"
  secondaryColor: string; // HSL
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  taxId: string | null;
  currency: string;
  language: string;
  appTitle: string | null;
  appDescription: string | null;
  footerNote: string | null;
  poweredBy: string | null;
}

export const DEFAULT_BRAND: BrandIdentity = {
  tenantId: null,
  companyName: "Gestion des stations-service",
  legalName: "Gestion des stations-service",
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "38 92% 50%",
  secondaryColor: "25 95% 53%",
  address: null,
  phone: null,
  email: null,
  website: null,
  taxId: null,
  currency: "XOF",
  language: "fr",
  appTitle: null,
  appDescription: null,
  footerNote: null,
  poweredBy: "Powered by LUMATEK TECHNOLOGY",
};

let activeBrand: BrandIdentity = DEFAULT_BRAND;

export const setActiveBrand = (brand: BrandIdentity) => {
  activeBrand = brand;
};

export const getActiveBrand = (): BrandIdentity => activeBrand;

/** Libellé de devise utilisé dans les documents */
export const currencyLabel = (brand: BrandIdentity = activeBrand) => {
  const map: Record<string, string> = {
    XOF: "FCFA",
    XAF: "FCFA",
    EUR: "€",
    USD: "$",
    GHS: "GH₵",
    NGN: "₦",
  };
  return map[brand.currency] || brand.currency;
};

export const formatBrandAmount = (
  value: number,
  brand: BrandIdentity = activeBrand
) =>
  `${new Intl.NumberFormat(brand.language === "en" ? "en-US" : "fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)} ${currencyLabel(brand)}`;

/** Convertit une couleur HSL ("38 92% 50%") en RGB pour jsPDF */
export const hslToRgb = (
  hsl: string,
  fallback: [number, number, number] = [245, 158, 11]
): [number, number, number] => {
  const m = hsl?.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return fallback;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
};

/** Pied de page des documents générés */
export const documentFooter = (brand: BrandIdentity = activeBrand) => {
  const year = new Date().getFullYear();
  const parts = [`© ${year} ${brand.legalName || brand.companyName}`];
  if (brand.footerNote) parts.push(brand.footerNote);
  if (brand.poweredBy) parts.push(brand.poweredBy);
  return parts.join(" · ");
};
