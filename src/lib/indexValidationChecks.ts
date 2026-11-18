/** Contrôles présentés au N+1 avant de valider une saisie d'index (lecture seule, aucune écriture). */
export interface ValidationCheckInput {
  ecartVersement: number;
  versementBanque: number;
  bordereau?: string | null;
  cartesDeclared: number;
  /** null = transactions réelles non disponibles */
  cartesReal: number | null;
  bonsDeclared: number;
  bonsReal: number | null;
  tanks: { name: string; ecart: number | null; jauge: number | null }[];
  hasPumpDetail: boolean;
  priorPending: number;
  closureStatus: string | null;
}

export interface ValidationCheck {
  code: string;
  level: "block" | "warn" | "info";
  message: string;
}

const f = (v: number) => Math.round(v).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");

export const buildValidationChecks = (i: ValidationCheckInput): ValidationCheck[] => {
  const out: ValidationCheck[] = [];
  if (i.priorPending > 0)
    out.push({ code: "prior", level: "block", message: `${i.priorPending} saisie(s) antérieure(s) de cette station non validée(s) : validez-les d'abord (ordre chronologique).` });
  if (Math.round(i.ecartVersement) !== 0)
    out.push({ code: "versement", level: "warn", message: `Écart sur versement de ${f(i.ecartVersement)} FCFA (${i.ecartVersement < 0 ? "sous-versement" : "sur-versement"}).` });
  if (i.versementBanque > 0 && !(i.bordereau ?? "").trim())
    out.push({ code: "bordereau", level: "warn", message: "Versement banque sans numéro de bordereau." });
  if (i.cartesReal !== null && Math.round(i.cartesDeclared - i.cartesReal) !== 0)
    out.push({ code: "cartes", level: "warn", message: `Ventes par carte déclarées ${f(i.cartesDeclared)} FCFA ≠ transactions Fuel Cards ${f(i.cartesReal)} FCFA.` });
  if (i.bonsReal !== null && Math.round(i.bonsDeclared - i.bonsReal) !== 0)
    out.push({ code: "bons", level: "warn", message: `Bons clients déclarés ${f(i.bonsDeclared)} FCFA ≠ consommations B2B ${f(i.bonsReal)} FCFA.` });
  for (const t of i.tanks) {
    if (t.jauge === null) out.push({ code: `jauge-${t.name}`, level: "warn", message: `${t.name} : jauge du soir non saisie.` });
    else if (t.ecart !== null && Math.round(t.ecart) !== 0)
      out.push({ code: `cuve-${t.name}`, level: "warn", message: `${t.name} : écart de stock ${f(t.ecart)} L (jauge − théorique).` });
  }
  if (!i.hasPumpDetail)
    out.push({ code: "legacy", level: "info", message: "Ancien format sans détail par pistolet : la clôture du jour ne sera pas générée." });
  if (i.closureStatus === "validated")
    out.push({ code: "closure", level: "info", message: "Clôture du jour déjà validée : elle sera conservée et les ventes ne seront pas repassées au stock." });
  else if (i.closureStatus === "submitted")
    out.push({ code: "closure", level: "warn", message: "Une clôture manuelle est soumise pour ce jour : elle ne sera pas remplacée." });
  return out;
};
