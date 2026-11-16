/**
 * Cellule CSV sûre : neutralise les formules (=, +, -, @, tabulation, retour chariot)
 * en préfixant d'une apostrophe, puis entoure de guillemets si nécessaire.
 * Les nombres sont conservés tels quels (montants négatifs inclus).
 */
export const csvCell = (v: unknown, sep = ";"): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(sep) || /["\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};

export const csvRow = (cells: unknown[], sep = ";") => cells.map((c) => csvCell(c, sep)).join(sep);
