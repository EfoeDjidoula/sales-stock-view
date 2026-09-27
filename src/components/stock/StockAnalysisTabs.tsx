import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { toast } from "sonner";
import { Check, X, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOVEMENT_LABEL } from "./StockEngineModule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Refs = Record<string, Row[]>;

const fmt = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }));
const IN = ["initial", "entry", "transfer_in", "adjustment_in"];
const OUT = ["exit", "sale", "transfer_out", "adjustment_out"];
const signed = (r: Row) => (IN.includes(r.movement_type) ? Number(r.quantity) : OUT.includes(r.movement_type) ? -Number(r.quantity) : 0);
const nameOf = (list: Row[], id?: string) => list.find((x) => x.id === id)?.name ?? "—";
const locName = (refs: Refs, r: Row) => (r.location_type === "station" ? nameOf(refs.stations, r.station_id) : nameOf(refs.depots, r.depot_id));
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const Table = ({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) => (
  <div className="rounded-xl border border-border bg-card overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-secondary/50 text-muted-foreground">
        <tr>{head.map((h) => <th key={h} className="text-left p-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>
        {children}
        {empty && <tr><td colSpan={head.length} className="p-6 text-center text-muted-foreground">Aucune donnée.</td></tr>}
      </tbody>
    </table>
  </div>
);

const Period = ({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) => (
  <>
    <div className="grid gap-1"><Label className="text-xs">Du</Label><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
    <div className="grid gap-1"><Label className="text-xs">Au</Label><Input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
  </>
);

/** Charge les mouvements de la portée active. */
const useMovements = (reload: number, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { scopeQuery, tenantId } = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!tenantId) return;
    setLoading(true);
    let q = scopeQuery(db.from("stock_movements").select("*"));
    if (filter) q = filter(q);
    q.order("movement_date", { ascending: true }).order("created_at", { ascending: true }).limit(2000)
      .then(({ data, error }: { data: Row[] | null; error: Error | null }) => {
        if (error) toast.error(error.message);
        setRows(data || []);
        setLoading(false);
      });
  }, [scopeQuery, tenantId, filter]);
  useEffect(() => { load(); }, [load, reload]);
  return { rows, loading, load };
};

/* ---------- 1. Validations en attente ---------- */
export const PendingTab = ({ refs, reload, onChanged, canValidate }: { refs: Refs; reload: number; onChanged: () => void; canValidate: boolean }) => {
  const filter = useCallback((q: any) => q.eq("status", "pending"), []); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { rows, loading, load } = useMovements(reload, filter);
  const decide = async (r: Row, next: "validated" | "rejected") => {
    const note = next === "rejected" ? window.prompt("Motif du rejet ?") : null;
    if (next === "rejected" && !note) return;
    const { error } = await db.from("stock_movements").update({ status: next, validation_note: note }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(next === "validated" ? "Mouvement validé" : "Mouvement rejeté");
    load(); onChanged();
  };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{rows.length} mouvement(s) en attente de validation. Ils n'affectent pas le stock tant qu'ils ne sont pas validés.</p>
      <Table head={["Date", "Type", "Emplacement", "Cuve", "Quantité", "Motif", "Demandé par", "Âge", ""]} empty={rows.length === 0}>
        {rows.map((r) => {
          const age = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 864e5);
          return (
            <tr key={r.id} className="border-t border-border">
              <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleDateString("fr-FR")}</td>
              <td className="p-2">{MOVEMENT_LABEL[r.movement_type]}</td>
              <td className="p-2">{locName(refs, r)}</td>
              <td className="p-2">{nameOf(refs.tanks, r.tank_id)}</td>
              <td className="p-2">{r.movement_type === "inventory" ? `mesuré ${fmt(r.physical_level)}` : fmt(r.quantity)}</td>
              <td className="p-2 max-w-[220px] truncate" title={r.reason}>{r.reason || "—"}</td>
              <td className="p-2">{r.requested_by_name || "—"}</td>
              <td className={`p-2 ${age > 2 ? "text-destructive font-medium" : ""}`}>{age} j</td>
              <td className="p-2 whitespace-nowrap">
                {canValidate ? (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => decide(r, "validated")} aria-label="Valider"><Check className="w-4 h-4 text-success" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => decide(r, "rejected")} aria-label="Rejeter"><X className="w-4 h-4 text-destructive" /></Button>
                  </>
                ) : <span className="text-xs text-muted-foreground">Validation non autorisée</span>}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
};

/* ---------- 2. Fiche de stock (solde cumulé) ---------- */
export const LedgerTab = ({ refs, reload }: { refs: Refs; reload: number }) => {
  const [locType, setLocType] = useState("station");
  const [locId, setLocId] = useState("");
  const [tankId, setTankId] = useState("");
  const [productId, setProductId] = useState("");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const filter = useCallback((q: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    q = q.eq("status", "validated").eq(locType === "station" ? "station_id" : "depot_id", locId || "00000000-0000-0000-0000-000000000000");
    if (tankId) q = q.eq("tank_id", tankId);
    if (productId) q = q.eq("product_id", productId);
    return q.lte("movement_date", `${to}T23:59:59`);
  }, [locType, locId, tankId, productId, to]);
  const { rows, loading } = useMovements(reload, filter);
  const { opening, lines, totals } = useMemo(() => {
    let bal = 0; let opening = 0; const lines: Row[] = []; const totals = { in: 0, out: 0 };
    for (const r of rows) {
      const s = signed(r);
      if (r.movement_date.slice(0, 10) < from) { bal += s; opening = bal; continue; }
      bal += s;
      if (s > 0) totals.in += s; else totals.out -= s;
      lines.push({ ...r, s, bal });
    }
    return { opening, lines, totals };
  }, [rows, from]);
  const list = locType === "station" ? refs.stations : refs.depots;
  const tanks = refs.tanks.filter((t) => t.station_id === locId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="grid gap-1"><Label className="text-xs">Type</Label>
          <Select value={locType} onValueChange={(v) => { setLocType(v); setLocId(""); setTankId(""); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="station">Station</SelectItem><SelectItem value="depot">Dépôt</SelectItem></SelectContent>
          </Select></div>
        <div className="grid gap-1"><Label className="text-xs">Emplacement</Label>
          <Select value={locId} onValueChange={(v) => { setLocId(v); setTankId(""); }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>{list.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select></div>
        {locType === "station" && (
          <div className="grid gap-1"><Label className="text-xs">Cuve</Label>
            <Select value={tankId || "all"} onValueChange={(v) => setTankId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Toutes</SelectItem>{tanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select></div>
        )}
        <div className="grid gap-1"><Label className="text-xs">Produit</Label>
          <Select value={productId || "all"} onValueChange={(v) => setProductId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous</SelectItem>{refs.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <Period from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      {!locId ? <p className="text-sm text-muted-foreground">Choisissez un emplacement pour afficher sa fiche de stock.</p> : loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[["Solde d'ouverture", opening], ["Entrées", totals.in], ["Sorties", totals.out], ["Solde de clôture", opening + totals.in - totals.out]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-display font-bold">{fmt(v)} L</div></div>
            ))}
          </div>
          <Table head={["Date", "Type", "Cuve", "Produit", "Entrée", "Sortie", "Solde", "Référence / motif"]} empty={lines.length === 0}>
            {lines.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleDateString("fr-FR")}</td>
                <td className="p-2">{MOVEMENT_LABEL[r.movement_type]}</td>
                <td className="p-2">{nameOf(refs.tanks, r.tank_id)}</td>
                <td className="p-2">{nameOf(refs.products, r.product_id)}</td>
                <td className="p-2 text-success">{r.s > 0 ? fmt(r.s) : ""}</td>
                <td className="p-2 text-destructive">{r.s < 0 ? fmt(-r.s) : ""}</td>
                <td className="p-2 font-semibold">{r.movement_type === "inventory" ? <span className="text-muted-foreground font-normal">mesuré {fmt(r.physical_level)}</span> : fmt(r.bal)}</td>
                <td className="p-2 max-w-[240px] truncate">{[r.reference, r.reason].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
};

/* ---------- 3. Écarts d'inventaire ---------- */
export const VarianceTab = ({ refs, reload }: { refs: Refs; reload: number }) => {
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const filter = useCallback((q: any) => q.eq("movement_type", "inventory").neq("status", "rejected").gte("movement_date", from).lte("movement_date", `${to}T23:59:59`), [from, to]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { rows, loading } = useMovements(reload, filter);
  const list = rows.map((r) => {
    const th = Number(r.theoretical_at_count ?? 0); const ph = Number(r.physical_level ?? 0);
    const v = ph - th; const pct = th ? (v / th) * 100 : 0;
    return { ...r, th, ph, v, pct };
  }).reverse();
  const total = list.filter((r) => r.status === "validated").reduce((a, r) => a + r.v, 0);
  const tol = 0.5;
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end"><Period from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Inventaires</div><div className="text-xl font-display font-bold">{list.length}</div></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Écart cumulé (validés)</div><div className={`text-xl font-display font-bold ${total < 0 ? "text-destructive" : ""}`}>{fmt(total)} L</div></div>
        <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">Hors tolérance (±{tol} %)</div><div className="text-xl font-display font-bold text-destructive">{list.filter((r) => Math.abs(r.pct) > tol).length}</div></div>
      </div>
      <Table head={["Date", "Emplacement", "Cuve", "Produit", "Théorique", "Mesuré", "Écart", "Écart %", "Statut", "Motif"]} empty={list.length === 0}>
        {list.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleDateString("fr-FR")}</td>
            <td className="p-2">{locName(refs, r)}</td>
            <td className="p-2">{nameOf(refs.tanks, r.tank_id)}</td>
            <td className="p-2">{nameOf(refs.products, r.product_id)}</td>
            <td className="p-2">{fmt(r.th)}</td><td className="p-2">{fmt(r.ph)}</td>
            <td className={`p-2 font-semibold ${r.v < 0 ? "text-destructive" : r.v > 0 ? "text-success" : ""}`}>{fmt(r.v)}</td>
            <td className={`p-2 ${Math.abs(r.pct) > tol ? "text-destructive font-medium" : ""}`}>{r.pct.toFixed(2)} %</td>
            <td className="p-2">{r.status === "validated" ? "Validé" : "En attente"}</td>
            <td className="p-2 max-w-[200px] truncate">{r.reason || "—"}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">Tolérance indicative de ±{tol} % choisie par défaut. Un écart se corrige par un ajustement motivé et validé.</p>
    </div>
  );
};

/* ---------- 4. Synthèse par produit ---------- */
export const SummaryTab = ({ refs, reload }: { refs: Refs; reload: number }) => {
  const { scopeQuery, tenantId } = useScope();
  const [levels, setLevels] = useState<Row[]>([]);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  useEffect(() => {
    if (!tenantId) return;
    scopeQuery(db.from("stock_levels").select("*")).then(({ data }: { data: Row[] | null }) => setLevels(data || []));
  }, [scopeQuery, tenantId, reload]);
  const filter = useCallback((q: any) => q.eq("status", "validated").gte("movement_date", from).lte("movement_date", `${to}T23:59:59`), [from, to]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { rows } = useMovements(reload, filter);
  const byProduct = refs.products.map((p) => {
    const lv = levels.filter((l) => l.product_id === p.id);
    const mv = rows.filter((r) => r.product_id === p.id);
    const sum = (types: string[]) => mv.filter((r) => types.includes(r.movement_type)).reduce((a, r) => a + Number(r.quantity), 0);
    const sales = sum(["sale"]);
    const days = Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 864e5 + 1);
    const stock = lv.reduce((a, l) => a + Number(l.theoretical || 0), 0);
    const perDay = sales / days;
    return {
      p, stock,
      depot: lv.filter((l) => l.location_type === "depot").reduce((a, l) => a + Number(l.theoretical || 0), 0),
      station: lv.filter((l) => l.location_type === "station").reduce((a, l) => a + Number(l.theoretical || 0), 0),
      entries: sum(["entry", "initial"]), sales, exits: sum(["exit"]),
      transfers: sum(["transfer_in"]), adj: sum(["adjustment_in"]) - sum(["adjustment_out"]),
      alerts: lv.filter((l) => l.alert_level !== "normal").length,
      cover: perDay > 0 ? stock / perDay : null,
    };
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end"><Period from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      <Table head={["Produit", "Stock total", "Dépôts", "Stations", "Entrées", "Ventes", "Sorties", "Transferts", "Ajustements nets", "Autonomie", "Alertes"]} empty={byProduct.length === 0}>
        {byProduct.map((r) => (
          <tr key={r.p.id} className="border-t border-border">
            <td className="p-2 font-medium">{r.p.name}</td>
            <td className="p-2 font-semibold">{fmt(r.stock)}</td><td className="p-2">{fmt(r.depot)}</td><td className="p-2">{fmt(r.station)}</td>
            <td className="p-2">{fmt(r.entries)}</td><td className="p-2">{fmt(r.sales)}</td><td className="p-2">{fmt(r.exits)}</td>
            <td className="p-2">{fmt(r.transfers)}</td>
            <td className={`p-2 ${r.adj < 0 ? "text-destructive" : ""}`}>{fmt(r.adj)}</td>
            <td className="p-2">{r.cover === null ? "—" : `${r.cover.toFixed(1)} j`}</td>
            <td className={`p-2 ${r.alerts ? "text-destructive font-medium" : ""}`}>{r.alerts}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted-foreground">Autonomie = stock total ÷ ventes moyennes par jour sur la période. Les mouvements de la période sont ceux déjà validés.</p>
    </div>
  );
};

/* ---------- 5. Suivi des transferts ---------- */
export const TransfersTab = ({ refs, reload }: { refs: Refs; reload: number }) => {
  const filter = useCallback((q: any) => q.in("movement_type", ["transfer_out", "transfer_in"]), []); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { rows, loading } = useMovements(reload, filter);
  const pairs = useMemo(() => {
    const m = new Map<string, Row>();
    rows.forEach((r) => {
      const k = r.transfer_id || r.id;
      const e = m.get(k) || { id: k };
      if (r.movement_type === "transfer_out") e.out = r; else e.in = r;
      m.set(k, e);
    });
    return [...m.values()].reverse();
  }, [rows]);
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <Table head={["Date", "Origine", "Destination", "Produit", "Quantité", "Référence", "Contrôle"]} empty={pairs.length === 0}>
      {pairs.map((t) => {
        const ok = t.out && t.in && Number(t.out.quantity) === Number(t.in.quantity);
        const r = t.out || t.in;
        return (
          <tr key={t.id} className="border-t border-border">
            <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleDateString("fr-FR")}</td>
            <td className="p-2">{t.out ? `${locName(refs, t.out)}${t.out.tank_id ? " · " + nameOf(refs.tanks, t.out.tank_id) : ""}` : "—"}</td>
            <td className="p-2">{t.in ? `${locName(refs, t.in)}${t.in.tank_id ? " · " + nameOf(refs.tanks, t.in.tank_id) : ""}` : "—"}</td>
            <td className="p-2">{nameOf(refs.products, r.product_id)}</td>
            <td className="p-2 font-semibold">{fmt(r.quantity)}</td>
            <td className="p-2">{r.reference || "—"}</td>
            <td className={`p-2 ${ok ? "text-success" : "text-destructive font-medium"}`}>{ok ? "Équilibré" : "Incomplet"}</td>
          </tr>
        );
      })}
    </Table>
  );
};

/* ---------- 6. Seuils d'alerte ---------- */
export const ThresholdsTab = ({ refs, onChanged, canEdit }: { refs: Refs; onChanged: () => void; canEdit: boolean }) => {
  const { scopeQuery, tenantId } = useScope();
  const [tanks, setTanks] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const load = useCallback(() => {
    if (!tenantId) return;
    scopeQuery(db.from("tanks").select("id,name,station_id,capacity_liters,min_threshold,critical_threshold")).order("name")
      .then(({ data }: { data: Row[] | null }) => setTanks(data || []));
  }, [scopeQuery, tenantId]);
  useEffect(() => { load(); }, [load]);
  const save = async (t: Row) => {
    const e = edits[t.id] || {};
    const min = e.min ?? t.min_threshold; const crit = e.crit ?? t.critical_threshold;
    const cap = Number(t.capacity_liters);
    const mn = min === "" || min === null ? null : Number(min);
    const cr = crit === "" || crit === null ? null : Number(crit);
    if ((mn !== null && (mn < 0 || mn > cap)) || (cr !== null && (cr < 0 || cr > cap))) return toast.error("Les seuils doivent être entre 0 et la capacité de la cuve");
    if (mn !== null && cr !== null && cr > mn) return toast.error("Le seuil critique doit être inférieur au seuil minimum");
    const { error } = await db.from("tanks").update({ min_threshold: mn, critical_threshold: cr }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Seuils enregistrés");
    setEdits((s) => { const n = { ...s }; delete n[t.id]; return n; });
    load(); onChanged();
  };
  return (
    <div className="space-y-2">
      <Table head={["Station", "Cuve", "Capacité", "Seuil minimum (L)", "Seuil critique (L)", ""]} empty={tanks.length === 0}>
        {tanks.map((t) => {
          const e = edits[t.id] || {};
          return (
            <tr key={t.id} className="border-t border-border">
              <td className="p-2">{nameOf(refs.stations, t.station_id)}</td>
              <td className="p-2">{t.name}</td>
              <td className="p-2">{fmt(t.capacity_liters)}</td>
              <td className="p-2"><Input type="number" min={0} disabled={!canEdit} className="w-32" placeholder={`défaut ${fmt(Number(t.capacity_liters) * 0.25)}`} value={e.min ?? t.min_threshold ?? ""} onChange={(ev) => setEdits((s) => ({ ...s, [t.id]: { ...e, min: ev.target.value } }))} /></td>
              <td className="p-2"><Input type="number" min={0} disabled={!canEdit} className="w-32" placeholder={`défaut ${fmt(Number(t.capacity_liters) * 0.1)}`} value={e.crit ?? t.critical_threshold ?? ""} onChange={(ev) => setEdits((s) => ({ ...s, [t.id]: { ...e, crit: ev.target.value } }))} /></td>
              <td className="p-2">{canEdit && edits[t.id] && <Button size="sm" variant="outline" className="gap-1" onClick={() => save(t)}><Save className="w-3.5 h-3.5" />Enregistrer</Button>}</td>
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-muted-foreground">Laissez vide pour utiliser les valeurs par défaut (25 % et 10 % de la capacité). Chaque modification est inscrite dans le journal système.</p>
    </div>
  );
};
