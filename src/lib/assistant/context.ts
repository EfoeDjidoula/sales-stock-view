/**
 * Assistant IA LUMATEK — analyses déterministes.
 * Toutes les valeurs sont calculées ici à partir de données déjà filtrées par la base
 * (tenant + pays autorisés). L'IA ne fait que rédiger à partir de ces faits.
 */
import { computeKpis, buildSaleFacts, groupFacts, deltaPct, previousRange, type Dataset } from "@/lib/metrics";
import { computeSupplyNeeds } from "@/lib/metrics/supplyPlanning";

export type Intent = "sales_drop" | "variances" | "credit" | "rupture" | "monthly";
export type Fact = { label: string; value: string; source: string };
export type AssistantContext = { intent: Intent; title: string; period: string; facts: Fact[]; rows: string[] };

export const CREDIT_ALERT_PCT = 80;
const f0 = (v: number) => Math.round(v).toLocaleString("fr-FR");

export const detectIntent = (q: string): Intent => {
  const s = q.toLowerCase();
  if (/rapport|mensuel|monthly|report/.test(s)) return "monthly";
  if (/plafond|crédit|credit|limit/.test(s)) return "credit";
  if (/rupture|stockout|run out/.test(s)) return "rupture";
  if (/écart|ecart|variance|gap/.test(s)) return "variances";
  return "sales_drop";
};

/** Clients dont l'utilisation (encours / limite) atteint le seuil. */
export const creditUsage = (
  d: Pick<Dataset, "invoices" | "payments"> & { clients: { id: string; name: string }[] },
  terms: { client_id: string; credit_limit: number; effective_at: string }[],
  threshold = CREDIT_ALERT_PCT,
) => {
  const latest = new Map<string, number>();
  [...terms].sort((a, b) => a.effective_at.localeCompare(b.effective_at)).forEach((t) => latest.set(t.client_id, Number(t.credit_limit) || 0));
  const paid = new Map<string, number>();
  d.payments.forEach((p) => paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + Number(p.amount)));
  const owed = new Map<string, number>();
  d.invoices.forEach((i) => owed.set(i.client_id, (owed.get(i.client_id) ?? 0) + Math.max(0, Number(i.amount) - (paid.get(i.id) ?? 0))));
  return d.clients
    .map((c) => { const limit = latest.get(c.id) ?? 0; const used = owed.get(c.id) ?? 0; return { name: c.name, limit, used, pct: limit > 0 ? (used / limit) * 100 : null }; })
    .filter((r) => r.pct != null && r.pct >= threshold)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
};

export const buildContext = (
  intent: Intent,
  d: Dataset & { clients: { id: string; name: string }[] },
  opts: { start: string; end: string; today: string; terms?: { client_id: string; credit_limit: number; effective_at: string }[]; countryName?: string },
): AssistantContext => {
  const { start, end, today } = opts;
  const period = `${start} → ${end}`;
  const name = new Map(d.stations.map((s) => [s.id, s.name]));
  const k = computeKpis(d, { start, end }, today);

  if (intent === "sales_drop") {
    const p = previousRange(start, end);
    const kp = computeKpis(d, p, today);
    const cur = groupFacts(buildSaleFacts(d, { start, end }).filter((x) => x.date >= start), (x) => x.stationId);
    const prv = new Map(groupFacts(buildSaleFacts(d, p).filter((x) => x.date >= p.start && x.date <= p.end), (x) => x.stationId).map((r) => [r.key, r.volume]));
    const ids = new Set([...cur.map((r) => r.key), ...prv.keys()]);
    const rows = [...ids].map((id) => { const c = cur.find((r) => r.key === id)?.volume ?? 0; const pv = prv.get(id) ?? 0; return { id, c, pv, dv: c - pv }; })
      .sort((a, b) => a.dv - b.dv).slice(0, 10)
      .map((r) => `${name.get(r.id) ?? r.id} : ${f0(r.c)} L vs ${f0(r.pv)} L (${r.dv >= 0 ? "+" : ""}${f0(r.dv)} L${deltaPct(r.c, r.pv) != null ? `, ${deltaPct(r.c, r.pv)!.toFixed(1)} %` : ""})`);
    const dp = deltaPct(k.volume, kp.volume);
    return { intent, title: "Évolution des ventes", period: `${period} vs ${p.start} → ${p.end}`, rows, facts: [
      { label: "Volume période", value: `${f0(k.volume)} L`, source: "Clôtures non rejetées, sinon index" },
      { label: "Volume période précédente", value: `${f0(kp.volume)} L`, source: "Clôtures non rejetées, sinon index" },
      { label: "Variation volume", value: dp == null ? "n/d" : `${dp.toFixed(1)} %`, source: "Calcul (cur − préc) / préc" },
      { label: "CA période", value: `${f0(k.amount)} FCFA`, source: "Clôtures" },
      { label: "Ruptures / critiques actuelles", value: `${k.ruptures} / ${k.critical}`, source: "Niveaux de stock" },
    ] };
  }
  if (intent === "variances") {
    const agg = new Map<string, { v: number; a: number; n: number }>();
    d.recons.filter((r) => r.recon_date >= start && r.recon_date <= end).forEach((r) => {
      const x = agg.get(r.station_id) ?? { v: 0, a: 0, n: 0 };
      x.v += Number(r.volume_variance) || 0; x.a += Number(r.value_variance) || 0; if (r.result === "anomaly" || r.result === "critical") x.n++;
      agg.set(r.station_id, x);
    });
    const rows = [...agg.entries()].sort((a, b) => Math.abs(b[1].a) - Math.abs(a[1].a)).slice(0, 10)
      .map(([id, x]) => `${name.get(id) ?? id} : écart ${f0(x.v)} L / ${f0(x.a)} FCFA, ${x.n} anomalie(s)`);
    return { intent, title: "Écarts par station", period, rows, facts: [
      { label: "Écart volume total", value: `${f0(k.varianceVolume)} L`, source: "Réconciliations" },
      { label: "Écart valeur total", value: `${f0(k.varianceValue)} FCFA`, source: "Réconciliations" },
      { label: "Journées en anomalie/critique", value: String(k.anomalies), source: "Réconciliations" },
    ] };
  }
  if (intent === "credit") {
    const list = creditUsage(d, opts.terms ?? []);
    return { intent, title: `Clients B2B ≥ ${CREDIT_ALERT_PCT} % du plafond`, period: `au ${today}`, rows: list.map((r) => `${r.name} : ${f0(r.used)} / ${f0(r.limit)} FCFA (${r.pct!.toFixed(1)} %)`), facts: [
      { label: "Clients au-dessus du seuil", value: String(list.length), source: "Conditions B2B + factures − paiements" },
      { label: "Créances totales", value: `${f0(k.receivables)} FCFA`, source: "Factures B2B" },
      { label: "Dont échues", value: `${f0(k.overdue)} FCFA`, source: "Factures B2B" },
    ] };
  }
  if (intent === "rupture") {
    const needs = computeSupplyNeeds(d, start, end, Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1));
    return { intent, title: "Risques de rupture", period, rows: needs.slice(0, 15).map((n) => `${n.stationName} ${n.kind} : stock ${f0(n.stock)}/${f0(n.capacity)} L, ventes ${f0(n.avgDaily)} L/j, couverture ${n.coverageDays == null ? "inconnue" : n.coverageDays.toFixed(1) + " j"}, urgence ${n.urgency}`), facts: [
      { label: "Couples station/produit à risque", value: String(needs.length), source: "Stock + ventes moyennes + appro en cours" },
      { label: "Ruptures actuelles", value: String(k.ruptures), source: "Niveaux de stock" },
    ] };
  }
  return { intent, title: `Rapport mensuel${opts.countryName ? ` — ${opts.countryName}` : ""}`, period, rows: [], facts: [
    { label: "Stations", value: String(k.stations), source: "Référentiel" },
    { label: "Volume", value: `${f0(k.volume)} L`, source: "Clôtures / index" },
    { label: "CA", value: `${f0(k.amount)} FCFA`, source: "Clôtures / index" },
    { label: "Marge", value: k.margin == null ? "n/d" : `${f0(k.margin)} FCFA`, source: "Structure de prix" },
    { label: "Stock", value: `${f0(k.stock)} L`, source: "Niveaux de stock" },
    { label: "Ruptures / critiques", value: `${k.ruptures} / ${k.critical}`, source: "Niveaux de stock" },
    { label: "Écart valeur", value: `${f0(k.varianceValue)} FCFA`, source: "Réconciliations" },
    { label: "Créances", value: `${f0(k.receivables)} FCFA`, source: "Factures B2B" },
    { label: "Disponibilité équipements", value: `${k.availability.toFixed(1)} %`, source: "Maintenance" },
    { label: "Conformité HSE", value: k.compliance == null ? "n/d" : `${k.compliance}/100`, source: "Inspections validées" },
  ] };
};
