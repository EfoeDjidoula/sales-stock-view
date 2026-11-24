import { jsPDF as BaseJsPDF, type jsPDFOptions } from "jspdf";
import { drawLetterhead, LETTERHEAD_TOP_MM, LETTERHEAD_BOTTOM_MM } from "./pdfLetterhead";
import type { BrandIdentity } from "./branding";

/**
 * Les formats fr-FR utilisent des espaces insécables (U+202F, U+00A0) comme
 * séparateurs de milliers. Les polices standard de jsPDF ne les connaissent
 * pas et affichent « 1 /234 ». On les remplace par une espace normale avant
 * tout rendu ou mesure de texte.
 */
const UNSUPPORTED_SPACES = /[\u202F\u00A0\u2007\u2009\u200A]/g;

export function pdfSafeText<T>(value: T): T {
  if (typeof value === "string") return value.replace(UNSUPPORTED_SPACES, " ") as T;
  if (Array.isArray(value)) return value.map((v) => pdfSafeText(v)) as T;
  return value;
}

type AnyFn = (...args: any[]) => any;

export class jsPDF extends BaseJsPDF {
  declare letterheadBrand?: BrandIdentity;
  constructor(options?: jsPDFOptions);
  constructor(
    orientation?: jsPDFOptions["orientation"],
    unit?: jsPDFOptions["unit"],
    format?: jsPDFOptions["format"],
    compressPdf?: boolean,
  );
  constructor(...args: any[]) {
    super(...(args as [jsPDFOptions]));
    const self = this as unknown as Record<string, AnyFn>;
    for (const name of ["text", "getTextWidth", "splitTextToSize", "getStringUnitWidth"]) {
      const original = self[name];
      if (typeof original !== "function") continue;
      self[name] = function (this: unknown, first: unknown, ...rest: unknown[]) {
        return original.call(this, pdfSafeText(first), ...rest);
      };
    }
    // Papier à en-tête : le contenu de chaque page est réduit dans la zone entre en-tête et pied de page.
    // (jsPDF renvoie son propre objet depuis le constructeur : on passe par des fonctions, pas des méthodes.)
    const doc = this as unknown as Doc;
    openLetterheadZone(doc);
    const addPage = self.addPage;
    self.addPage = function (this: unknown, ...a: unknown[]) {
      const r = addPage.apply(this, a);
      openLetterheadZone(doc);
      return r;
    };
    for (const name of ["output", "save"]) {
      const original = self[name];
      self[name] = function (this: unknown, ...a: unknown[]) {
        stampLetterhead(doc);
        return original.apply(this, a);
      };
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;
const stamped = new WeakSet<object>();

function openLetterheadZone(doc: Doc) {
  const W = doc.internal.pageSize.getWidth() * doc.internal.scaleFactor; // pt
  const H = doc.internal.pageSize.getHeight() * doc.internal.scaleFactor;
  const top = (LETTERHEAD_TOP_MM * 72) / 25.4, bottom = (LETTERHEAD_BOTTOM_MM * 72) / 25.4;
  const k = (H - top - bottom) / H;
  const f = (v: number) => v.toFixed(4);
  doc.internal.write("q", f(k), "0", "0", f(k), f((W * (1 - k)) / 2), f(bottom), "cm");
}

/** Ferme la zone réduite et dessine l'en-tête/pied de page sur chaque page (une seule fois par document). */
export function stampLetterhead(doc: Doc) {
  if (stamped.has(doc)) return;
  stamped.add(doc);
  const pages = doc.getNumberOfPages();
  const current = doc.getCurrentPageInfo().pageNumber;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.internal.write("Q");
    drawLetterhead(doc, i, pages, doc.letterheadBrand);
  }
  doc.setPage(current);
}

export default jsPDF;
