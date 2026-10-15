export const FIRE_DRILL_MAX_DAYS = 180;
export const COMPLIANCE_ALERT_THRESHOLD = 65;

export type ScoreFactor = { key: string; label: string; weight: number; value: number; detail: string };
export type ComplianceInput = {
  lastInspectionScore: number | null; // % dernière inspection validée
  openCriticalNc: number;
  safetyItemsTotal: number;
  safetyItemsExpired: number;
  openActions: number;
  overdueActions: number;
  daysSinceFireDrill: number | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Compliance Score 0–100 : somme pondérée de 5 facteurs explicables. */
export const complianceScore = (i: ComplianceInput): { score: number; factors: ScoreFactor[] } => {
  const factors: ScoreFactor[] = [
    { key: "inspection", label: "Dernière inspection validée", weight: 40, value: i.lastInspectionScore ?? 0,
      detail: i.lastInspectionScore == null ? "Aucune inspection validée" : `${i.lastInspectionScore} % de conformité` },
    { key: "critical", label: "Non-conformités critiques ouvertes", weight: 25, value: clamp(100 - 25 * i.openCriticalNc),
      detail: `${i.openCriticalNc} ouverte(s), −25 pts chacune` },
    { key: "safety", label: "Équipements de sécurité valides", weight: 15,
      value: i.safetyItemsTotal ? clamp(100 * (1 - i.safetyItemsExpired / i.safetyItemsTotal)) : 0,
      detail: i.safetyItemsTotal ? `${i.safetyItemsExpired}/${i.safetyItemsTotal} périmé(s) ou vérification dépassée` : "Aucun équipement enregistré" },
    { key: "deadlines", label: "Respect des échéances d'actions", weight: 10,
      value: i.openActions ? clamp(100 * (1 - i.overdueActions / i.openActions)) : 100,
      detail: `${i.overdueActions}/${i.openActions} action(s) en retard` },
    { key: "drill", label: "Exercice incendie récent", weight: 10,
      value: i.daysSinceFireDrill != null && i.daysSinceFireDrill <= FIRE_DRILL_MAX_DAYS ? 100 : 0,
      detail: i.daysSinceFireDrill == null ? "Aucun exercice enregistré" : `Il y a ${i.daysSinceFireDrill} j (max ${FIRE_DRILL_MAX_DAYS} j)` },
  ];
  const score = Math.round(factors.reduce((s, f) => s + (f.value * f.weight) / 100, 0));
  return { score, factors };
};

export const scoreTone = (s: number) => (s >= 80 ? "green" : s >= COMPLIANCE_ALERT_THRESHOLD ? "orange" : "red");
