import { jsPDF as BaseJsPDF, type jsPDFOptions } from "jspdf";

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
  }
}

export default jsPDF;
