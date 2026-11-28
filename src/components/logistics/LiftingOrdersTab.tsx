import { isTowed } from "@/lib/fleet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileDown, History, PenLine, Plus, Search, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useLanguage } from "@/hooks/useLanguage";
import { useBranding } from "@/hooks/useBranding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignaturePad } from "@/components/pro/EcmrSignDialog";
import { depotBalances, planByProduct, planExcess, type InitialStock, type LiftingStatus, type PaymentStatus } from "@/lib/depotSupply";
import { jsPDF } from "@/lib/pdf";
import { TankerTruckVisualizer } from "./TankerTruckVisualizer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const fmt = (v: number) => Math.round(Number(v || 0)).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
const fmtD = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtDt = (d?: string) => (d ? new Date(d).toLocaleString("fr-FR") : "—");
const STATUS: Record<LiftingStatus, [string, string, "default" | "secondary" | "destructive" | "outline"]> = {
  established: ["Établi — à signer", "Drafted — to sign", "secondary"],
  signed: ["Signé", "Signed", "default"],
  cancelled: ["Annulé", "Cancelled", "destructive"],
};
type Line = { compartment_id?: string; position?: number; capacity?: number; product_id: string; qty_litres: string; destination_type: "station" | "client"; station_id: string; client_id: string; stop_order: string };
const blank = (extra: Partial<Line> = {}): Line => ({ product_id: "", qty_litres: "", destination_type: "station", station_id: "", client_id: "", stop_order: "1", ...extra });

/** 2. Bons d'enlèvement : BC payé/crédit → camion & chauffeur disponibles → plan par compartiment → signature (écritures via depot_supply_action). */
export const LiftingOrdersTab = ({ canWrite, canValidate }: { canWrite: boolean; canValidate: boolean }) => {
  const { language } = useLanguage();
  const L = (fr: string, en: string) => (language === "en" ? en : fr);
  const { scopeQuery, tenantId, countryId } = useScope();
  const brand = useBranding();
  const [d, setD] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState({ status: "all", q: "" });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Row>({});
  const [mode, setMode] = useState<"mono" | "mixed">("mono");
  const [monoProduct, setMonoProduct] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [signFor, setSignFor] = useState<Row | null>(null);
  const [dirFor, setDirFor] = useState<Row | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [departing, setDeparting] = useState(false);
  const [activeComp, setActiveComp] = useState<number>();

  const load = useCallback(async () => {
    if (!tenantId || !countryId) return;
    setLoading(true);
    const q = (t: string, sel = "*") => scopeQuery(db.from(t).select(sel));
    const res = await Promise.all([
      q("depot_purchase_orders", "*, depot_proformas(number, depot_id, supplier_id, suppliers(name), depots(name), depot_proforma_lines(*, petroleum_products(name)))").order("created_at", { ascending: false }).limit(300),
      q("depot_lifting_orders", "*, depot_lifting_lines(*)").order("created_at", { ascending: false }).limit(300),
      q("logistics_vehicles", "id,registration,kind,capacity_litres,status,default_driver_id,default_trailer_id").order("registration"),
      q("logistics_compartments").order("position"),
      q("logistics_drivers", "id,full_name,phone,license_number").order("full_name"),
      q("petroleum_products", "id,name").order("name"),
      q("stations", "id,name").order("name"),
      db.from("clients").select("id,name").eq("tenant_id", tenantId).order("name"),
      q("depots", "id,name").order("name"),
      q("logistics_trip_loads"),
      q("logistics_trips", "id,reference,status"),
      db.rpc("logistics_vehicle_availability", { _tenant: tenantId, _country: countryId }),
      db.rpc("logistics_driver_availability", { _tenant: tenantId, _country: countryId }),
      q("stock_movements", "depot_id,product_id,quantity").eq("location_type", "depot").eq("movement_type", "initial").eq("status", "validated"),
    ]);
    const keys = ["orders", "liftings", "vehicles", "compartments", "drivers", "products", "stations", "clients", "depots", "loads", "trips", "vAvail", "dAvail", "initial"];
    const out: Record<string, Row[]> = {};
    res.forEach((r: Row, i: number) => { out[keys[i]] = r.data ?? []; if (r.error) console.error(keys[i], r.error); });
    setD(out); setLoading(false);
  }, [tenantId, countryId, scopeQuery]);
  useEffect(() => { load(); }, [load]);

  const name = (list: string, id?: string, key = "name") => (d[list] ?? []).find((x) => x.id === id)?.[key] ?? "—";
  const vAvail = useMemo(() => new Map((d.vAvail ?? []).map((a) => [a.vehicle_id, a])), [d.vAvail]);
  const dAvail = useMemo(() => new Map((d.dAvail ?? []).map((a) => [a.driver_id, a])), [d.dAvail]);
  const reservedLines = useMemo(() => (d.liftings ?? []).flatMap((b) => (b.depot_lifting_lines ?? []).map((l: Row) => ({ ...l, status: b.status, depot_id: b.depot_id }))), [d.liftings]);
  const pooled = useMemo(() => (d.orders ?? []).map((o) => ({ depot_id: o.depot_proformas?.depot_id, status: o.payment_status as PaymentStatus, lines: o.depot_proformas?.depot_proforma_lines ?? [] })), [d.orders]);
  const balances = useMemo(() => depotBalances(pooled, f.depot_id, reservedLines, (d.initial ?? []) as InitialStock[]), [pooled, f.depot_id, reservedLines, d.initial]);
  const order = f.depot_id ? { id: f.depot_id } : null;
  const orderProducts = Object.entries(balances).filter(([, q]) => q > 0).map(([id]) => ({ id, name: name("products", id) }));
  const truck = (d.vehicles ?? []).find((v) => v.id === f.vehicle_id);
  const vehId = truck?.kind === "tractor" ? f.tanker_id : f.vehicle_id;
  const veh = (d.vehicles ?? []).find((v) => v.id === vehId);
  const comps = useMemo(() => (d.compartments ?? []).filter((c) => c.vehicle_id === vehId).sort((a, b) => a.position - b.position), [d.compartments, vehId]);
  const capacity = comps.length ? comps.reduce((s, c) => s + Number(c.capacity_litres), 0) : Number(veh?.capacity_litres ?? 0);

  useEffect(() => {
    if (!vehId) { setLines([]); return; }
    setLines(comps.length ? comps.map((c) => blank({ compartment_id: c.id, position: c.position, capacity: Number(c.capacity_litres), qty_litres: String(c.capacity_litres) })) : [blank({ qty_litres: capacity ? String(capacity) : "" })]);
  }, [vehId, comps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = lines.map((l) => ({ ...l, product_id: mode === "mono" ? monoProduct : l.product_id }));
  const total = plan.reduce((s, l) => s + (Number(l.qty_litres) || 0), 0);
  const excess = planExcess(plan.filter((l) => l.product_id), balances);
  const byProduct = planByProduct(plan);
  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const openNew = () => { setF({ planned_date: new Date().toISOString().slice(0, 10) }); setMode("mono"); setMonoProduct(""); setLines([]); setActiveComp(undefined); setDeparting(false); setOpen(true); };
  const act = async (action: string, data: Row, ok: string) => {
    setBusy(true);
    const { error } = await db.rpc("depot_supply_action", { _action: action, _data: data });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); load(); return true;
  };
  const save = async () => {
    if (!f.depot_id || !f.vehicle_id || !f.driver_id) return toast.error(L("Dépôt, camion et chauffeur obligatoires", "Depot, truck and driver required"));
    if (truck?.kind === "tractor" && !f.tanker_id) return toast.error(L("Choisissez la citerne attelée au tracteur", "Choose the tanker hitched to the tractor"));
    if (plan.some((l) => !l.product_id)) return toast.error(L("Produit manquant", "Missing product"));
    if (plan.some((l) => (l.destination_type === "station" ? !l.station_id : !l.client_id))) return toast.error(L("Site de destination manquant", "Missing destination"));
    if (total !== capacity) return toast.error(L("Le camion doit être chargé à son volume total", "The truck must be loaded to full capacity"));
    if (excess.length) return toast.error(L("Quantité supérieure au stock disponible du dépôt", "Quantity above the depot available stock"));
    if (await act("create_lifting", { ...f, order_id: null, tenant_id: tenantId, country_id: countryId, tanker_id: truck?.kind === "tractor" ? f.tanker_id : null, load_mode: mode, lines: plan }, L("Bon d'enlèvement établi", "Lifting order drafted"))) {
      setDeparting(true);
      const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 1800;
      window.setTimeout(() => { setOpen(false); setDeparting(false); }, delay);
    }
  };

  const openHistory = async (b: Row) => {
    setHistory(b);
    const { data } = await db.from("depot_lifting_events").select("*").eq("lifting_id", b.id).order("created_at");
    setEvents(data ?? []);
  };

  const liftings = (d.liftings ?? []).filter((b) => (filter.status === "all" || b.status === filter.status) &&
    (!filter.q || [b.number, name("vehicles", b.vehicle_id, "registration"), name("drivers", b.driver_id, "full_name"), (d.orders ?? []).find((o) => o.id === b.order_id)?.number].join(" ").toLowerCase().includes(filter.q.toLowerCase())));
  const kpi = {
    established: (d.liftings ?? []).filter((b) => b.status === "established").length,
    signed: (d.liftings ?? []).filter((b) => b.status === "signed").length,
    reserved: (d.liftings ?? []).filter((b) => b.status === "established").reduce((s, b) => s + Number(b.total_litres), 0),
    trucks: (d.vAvail ?? []).filter((a) => a.available && !isTowed(a.kind)).length,
  };

  const beLoads = (b: Row) => ((d.loads ?? []) as (Row & { product_id: string; qty_litres: number })[]).filter((l) => l.trip_id === b.trip_id).sort((a, c) => (a.stop_order - c.stop_order) || 0);
  const compPos = (id?: string) => (d.compartments ?? []).find((c) => c.id === id)?.position;
  const dest = (l: Row) => (l.destination_type === "station" ? name("stations", l.station_id) : name("clients", l.client_id));

  const pdf = (b: Row) => {
    const o = (d.orders ?? []).find((x) => x.id === b.order_id); const pf = o?.depot_proformas;
    const doc = new jsPDF({ unit: "mm", format: "a4" }); const W = doc.internal.pageSize.getWidth(); let y = 18;
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(`BON D'ENLÈVEMENT N° ${b.number}`, W / 2, y, { align: "center" }); y += 6;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(b.status === "cancelled" ? `ANNULÉ — ${b.cancel_reason ?? ""}` : b.status === "signed" ? "Document signé — non modifiable" : "Établi — en attente de signature", W / 2, y, { align: "center" }); y += 8;
    doc.setFontSize(9.5);
    const info: [string, string][] = [
      ["Émetteur", brand.legalName || brand.companyName], ["Date prévue", fmtD(b.planned_date)],
      ["Bon de commande", `${o?.number ?? "—"} (${o?.beneficiary_name ?? "—"})`], ["Fournisseur", pf?.suppliers?.name ?? "—"],
      ["Dépôt de chargement", name("depots", b.depot_id)], ["Camion", `${name("vehicles", b.vehicle_id, "registration")}${b.tanker_id ? ` + citerne ${name("vehicles", b.tanker_id, "registration")}` : ""}`],
      ["Chauffeur", `${name("drivers", b.driver_id, "full_name")}${(d.drivers ?? []).find((x) => x.id === b.driver_id)?.license_number ? ` — permis ${(d.drivers ?? []).find((x) => x.id === b.driver_id)?.license_number}` : ""}`],
      ["Type de chargement", b.load_mode === "mixed" ? "Produits mixtes" : "Mono-produit"],
    ];
    info.forEach(([k, v]) => { doc.setFont("helvetica", "bold"); doc.text(`${k} :`, 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v), 58, y); y += 6; });
    y += 3;
    const cols = [14, 34, 80, 110, 140]; const head = ["Comp.", "Produit", "Capacité (L)", "Qté prévue (L)", "Site de destination"];
    doc.setFillColor(230, 230, 230); doc.rect(12, y - 5, W - 24, 7, "F"); doc.setFont("helvetica", "bold");
    head.forEach((h, i) => doc.text(h, cols[i], y)); y += 7; doc.setFont("helvetica", "normal");
    beLoads(b).forEach((l, i) => {
      const cap = (d.compartments ?? []).find((c) => c.id === l.compartment_id)?.capacity_litres ?? l.qty_litres;
      [String(compPos(l.compartment_id) ?? i + 1), name("products", l.product_id), fmt(cap), fmt(l.qty_litres), dest(l)].forEach((v, k) => doc.text(String(v), cols[k], y));
      doc.line(12, y + 2, W - 12, y + 2); y += 7;
    });
    y += 2; doc.setFont("helvetica", "bold");
    Object.entries(planByProduct(beLoads(b))).forEach(([pid, q]) => { doc.text(`Total ${name("products", pid)}`, 110, y); doc.text(`${fmt(q)} L`, W - 14, y, { align: "right" }); y += 6; });
    doc.text("Total chargé", 110, y); doc.text(`${fmt(b.total_litres)} L`, W - 14, y, { align: "right" }); y += 12;
    doc.setFont("helvetica", "normal");
    doc.text("Le Responsable Logistique", 20, y); doc.text("Le Directeur d'Exploitation", W - 80, y); y += 3;
    if (b.signature_png) {
      try { doc.addImage(b.signature_png, "PNG", 16, y, 50, 16); } catch { /* signature illisible */ }
      doc.setFontSize(8); doc.text(`${b.signed_by_name ?? ""} — ${fmtDt(b.signed_at)}`, 16, y + 20); doc.setFontSize(9.5);
    }
    if (b.director_signature_png) {
      try { doc.addImage(b.director_signature_png, "PNG", W - 84, y, 50, 16); } catch { /* signature illisible */ }
      doc.setFontSize(8); doc.text(`${b.director_signed_by_name ?? ""} — ${fmtDt(b.director_signed_at)}`, W - 84, y + 20);
    }
    doc.save(`${b.number}.pdf`);
  };

  const availBadge = (a?: Row) => !a ? <Badge variant="outline">—</Badge> : a.available
    ? <Badge variant="outline" className="border-primary text-primary">{L("Disponible", "Available")}</Badge>
    : <Badge variant="destructive">{L("Indisponible", "Unavailable")}</Badge>;
  const optLabel = (label: string, a?: Row) => (a && !a.available ? `${label} — ${L("indisponible", "unavailable")}` : label);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {([[L("BE à signer", "To sign"), kpi.established, ""], [L("BE signés", "Signed"), kpi.signed, ""], [L("Réservé (non signé)", "Reserved (unsigned)"), kpi.reserved, " L"], [L("Camions disponibles", "Trucks available"), kpi.trucks, ""]] as [string, number, string][]).map(([l, v, u]) => (
          <Card key={l} className="glass-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <div className="text-2xl font-bold font-display">{fmt(v)}{u}</div>}
          </CardContent></Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{L("Un BE ne peut dépasser le stock disponible du dépôt, par produit (stock initial du dépôt + bons de commande payés ou à crédit, moins enlevé et réservé). La quantité est réservée dès l'établissement et comptée comme enlevée à la signature du responsable logistique ; le chargement du camion n'est possible qu'après signature.", "A lifting order cannot exceed the depot available stock per product (depot opening stock + paid or credit POs, minus lifted and reserved). Quantity is reserved when drafted and counted as lifted once the logistics manager signs; loading is only possible after signature.")}</p>

      <Card className="glass-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{L("Bons d'enlèvement", "Lifting orders")}</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative"><Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" /><Input className="pl-8 h-9 w-48" placeholder={L("BE, BC, camion…", "LO, PO, truck…")} value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} /></div>
            <Select value={filter.status} onValueChange={(v) => setFilter({ ...filter, status: v })}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{L("Tous statuts", "All statuses")}</SelectItem>{(Object.keys(STATUS) as LiftingStatus[]).map((s) => <SelectItem key={s} value={s}>{L(STATUS[s][0], STATUS[s][1])}</SelectItem>)}</SelectContent></Select>
            {canWrite && <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />{L("Nouveau bon d'enlèvement", "New lifting order")}</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{L("N° BE", "LO #")}</TableHead><TableHead>{L("BC / dépôt", "PO / depot")}</TableHead><TableHead>{L("Camion / chauffeur", "Truck / driver")}</TableHead>
              <TableHead>{L("Produits", "Products")}</TableHead><TableHead className="text-right">{L("Total", "Total")}</TableHead><TableHead>{L("Destinations", "Destinations")}</TableHead>
              <TableHead>{L("Statut", "Status")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {liftings.length === 0 && !loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">{L("Aucun bon d'enlèvement", "No lifting order")}</TableCell></TableRow>}
              {liftings.map((b) => {
                const o = (d.orders ?? []).find((x) => x.id === b.order_id); const ls = beLoads(b);
                const trip = (d.trips ?? []).find((t) => t.id === b.trip_id);
                return (
                  <TableRow key={b.id}>
                    <TableCell><div className="font-mono text-xs font-medium">{b.number}</div><div className="text-xs text-muted-foreground">{fmtD(b.planned_date)}</div></TableCell>
                    <TableCell><div className="text-sm">{o?.number ?? "—"}</div><div className="text-xs text-muted-foreground">{name("depots", b.depot_id)}</div></TableCell>
                    <TableCell><div>{name("vehicles", b.vehicle_id, "registration")}{b.tanker_id && ` + ${name("vehicles", b.tanker_id, "registration")}`}</div><div className="text-xs text-muted-foreground">{name("drivers", b.driver_id, "full_name")}</div></TableCell>
                    <TableCell className="text-xs">{Object.entries(planByProduct(ls)).map(([pid, q]) => <div key={pid}>{name("products", pid)} · {fmt(q)} L</div>)}<div className="text-muted-foreground">{ls.length} {L("compart.", "comp.")} · {b.load_mode === "mixed" ? L("mixte", "mixed") : L("mono", "single")}</div></TableCell>
                    <TableCell className="text-right font-medium">{fmt(b.total_litres)} L</TableCell>
                    <TableCell className="text-xs">{[...new Set(ls.map(dest))].join(", ") || "—"}</TableCell>
                    <TableCell><Badge variant={STATUS[b.status as LiftingStatus][2]}>{L(STATUS[b.status as LiftingStatus][0], STATUS[b.status as LiftingStatus][1])}</Badge>
                      {trip && <div className="text-[11px] text-muted-foreground mt-1">{trip.reference}</div>}
                      {b.status === "signed" && <div className="text-[11px] text-muted-foreground">{L("Logistique", "Logistics")} : {b.signed_by_name} · {fmtD(b.signed_at)}</div>}
                      {b.status === "signed" && <div className="text-[11px] text-muted-foreground">{L("Dir. exploitation", "Ops director")} : {b.director_signed_at ? `${b.director_signed_by_name ?? ""} · ${fmtD(b.director_signed_at)}` : L("visa en attente", "pending")}</div>}</TableCell>
                    <TableCell><div className="flex gap-1">
                      {canValidate && b.status === "established" && <Button size="sm" onClick={() => { setSignFor(b); setPng(null); }}><PenLine className="h-4 w-4 mr-1" />{L("Signer", "Sign")}</Button>}
                      {canValidate && b.status === "signed" && !b.director_signed_at && <Button size="sm" variant="outline" onClick={() => { setDirFor(b); setPng(null); }}><PenLine className="h-4 w-4 mr-1" />{L("Visa directeur", "Director visa")}</Button>}
                      <Button size="icon" variant="ghost" title="PDF" onClick={() => pdf(b)}><FileDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title={L("Historique", "History")} onClick={() => openHistory(b)}><History className="h-4 w-4" /></Button>
                      {canValidate && b.status !== "cancelled" && trip?.status === "planned" && <Button size="icon" variant="ghost" title={L("Annuler", "Cancel")} onClick={() => { setCancelFor(b); setReason(""); }}><XCircle className="h-4 w-4 text-destructive" /></Button>}
                    </div></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">{L("Disponibilité des camions & citernes", "Truck & tanker availability")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>{L("Immatriculation", "Registration")}</TableHead><TableHead className="text-right">{L("Capacité", "Capacity")}</TableHead><TableHead>{L("État", "State")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(d.vAvail ?? []).length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{L("Aucun véhicule", "No vehicle")}</TableCell></TableRow>}
              {(d.vAvail ?? []).map((a) => (
                <TableRow key={a.vehicle_id}><TableCell>{a.registration}<div className="text-xs text-muted-foreground">{a.kind}</div></TableCell><TableCell className="text-right">{fmt(a.capacity)} L</TableCell>
                  <TableCell>{availBadge(a)}{(a.reasons ?? []).map((r: string) => <div key={r} className="text-xs text-destructive mt-1">{r}</div>)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">{L("Disponibilité des chauffeurs", "Driver availability")}</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>{L("Chauffeur", "Driver")}</TableHead><TableHead>{L("État", "State")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {(d.dAvail ?? []).length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">{L("Aucun chauffeur", "No driver")}</TableCell></TableRow>}
              {(d.dAvail ?? []).map((a) => (
                <TableRow key={a.driver_id}><TableCell>{a.full_name}</TableCell>
                  <TableCell>{availBadge(a)}{(a.reasons ?? []).map((r: string) => <div key={r} className="text-xs text-destructive mt-1">{r}</div>)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table></CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">{L("Pour rendre un camion disponible : enregistrez ses documents (assurance, carte grise, visite technique) dans « Documents », et le permis poids lourd du chauffeur. Un camion reste indisponible tant que son chargement précédent n'est pas entièrement dépoté.", "To make a truck available: record its documents (insurance, registration, technical inspection) under “Documents”, and the driver's HGV licence. A truck stays unavailable until its previous load is fully unloaded.")}</p>

      <Dialog open={open} onOpenChange={(value) => { if (!departing) setOpen(value); }}>
        <DialogContent className="w-[calc(100vw-1rem)] min-w-0 max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
          <DialogHeader><DialogTitle>{L("Nouveau bon d'enlèvement", "New lifting order")}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>{L("Dépôt de chargement", "Loading depot")}</Label>
              <Select value={f.depot_id ?? ""} onValueChange={(v) => { setF({ ...f, depot_id: v }); setMonoProduct(""); }}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(d.depots ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {order && (
            <div className="rounded-md border border-border p-2 text-sm">
              <div className="text-xs text-muted-foreground mb-1">{L("Stock disponible au dépôt (par produit)", "Depot available stock (per product)")}</div>
              <div className="flex flex-wrap gap-3">{orderProducts.map((p: Row) => <span key={p.id}><b>{p.name}</b> : {fmt(balances[p.id] ?? 0)} L</span>)}</div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-4">
            <div><Label>{L("Camion (porteur / tracteur)", "Truck (rigid / tractor)")}</Label>
              <Select value={f.vehicle_id ?? ""} onValueChange={(v) => { const veh = (d.vehicles ?? []).find((x) => x.id === v); setF({ ...f, vehicle_id: v, tanker_id: veh?.kind === "tractor" ? veh?.default_trailer_id ?? undefined : undefined, driver_id: veh?.default_driver_id ?? f.driver_id }); }}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(d.vehicles ?? []).filter((v) => !isTowed(v.kind)).map((v) => <SelectItem key={v.id} value={v.id} disabled={!vAvail.get(v.id)?.available}>{optLabel(v.registration, vAvail.get(v.id))}</SelectItem>)}</SelectContent></Select></div>
            {truck?.kind === "tractor" && <div><Label>{L("Citerne attelée", "Hitched tanker")}</Label>
              <Select value={f.tanker_id ?? ""} onValueChange={(v) => setF({ ...f, tanker_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(d.vehicles ?? []).filter((v) => isTowed(v.kind)).map((v) => <SelectItem key={v.id} value={v.id} disabled={!vAvail.get(v.id)?.available}>{optLabel(v.registration, vAvail.get(v.id))}</SelectItem>)}</SelectContent></Select></div>}
            <div><Label>{L("Chauffeur", "Driver")}</Label>
              <Select value={f.driver_id ?? ""} onValueChange={(v) => setF({ ...f, driver_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(d.drivers ?? []).map((x) => <SelectItem key={x.id} value={x.id} disabled={!dAvail.get(x.id)?.available}>{optLabel(x.full_name, dAvail.get(x.id))}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{L("Date d'enlèvement prévue", "Planned lifting date")}</Label><Input type="date" value={f.planned_date ?? ""} onChange={(e) => setF({ ...f, planned_date: e.target.value })} /></div>
          </div>
          {(d.vehicles ?? []).some((v) => !isTowed(v.kind) && !vAvail.get(v.id)?.available) && <p className="text-xs text-muted-foreground">{L("Les camions grisés sont indisponibles : la raison est indiquée dans « Disponibilité des camions » sous ce tableau.", "Greyed trucks are unavailable: see the reason in “Truck availability” below.")}</p>}

          {vehId && capacity > 0 && order && (
            <div className="space-y-3">
              <TankerTruckVisualizer
                registration={truck?.registration ?? "—"}
                trailerRegistration={truck?.kind === "tractor" ? veh?.registration : undefined}
                driverName={f.driver_id ? name("drivers", f.driver_id, "full_name") : undefined}
                compartments={plan.map((l, i) => ({
                  id: l.compartment_id,
                  position: l.position ?? i + 1,
                  capacity: Number(l.capacity) || Number(l.qty_litres) || 0,
                  qty: l.qty_litres,
                  productName: l.product_id ? name("products", l.product_id) : undefined,
                  destinationName: l.destination_type === "station" ? (l.station_id ? name("stations", l.station_id) : undefined) : (l.client_id ? name("clients", l.client_id) : undefined),
                  stopOrder: l.stop_order,
                }))}
                capacity={capacity}
                departing={departing}
                activeIndex={activeComp}
                L={L}
                onCompartmentClick={(index) => {
                  setActiveComp(index);
                  document.getElementById(`lifting-plan-line-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              <div className="grid md:grid-cols-3 gap-3 items-end">
                <div><Label>{L("Type de chargement", "Load type")}</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as "mono" | "mixed")}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="mono">{L("Mono-produit", "Single product")}</SelectItem><SelectItem value="mixed">{L("Produits mixtes", "Mixed products")}</SelectItem></SelectContent></Select></div>
                {mode === "mono" && <div><Label>{L("Produit (tout le camion)", "Product (whole truck)")}</Label>
                  <Select value={monoProduct} onValueChange={setMonoProduct}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{orderProducts.map((p: Row) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>}
                <div className="text-sm">{L("Volume", "Volume")} : <b>{fmt(total)}</b> / {fmt(capacity)} L {total === capacity ? <Badge variant="outline">100 %</Badge> : <Badge variant="destructive">{L("incomplet", "incomplete")}</Badge>}</div>
              </div>
              {lines.map((l, i) => (
                <div id={`lifting-plan-line-${i}`} key={i} className={`grid md:grid-cols-6 gap-2 items-end border rounded-md p-2 transition-colors ${activeComp === i ? "border-ring bg-primary/5" : "border-border/50"}`}>
                  <div className="text-sm font-medium">{l.compartment_id ? `${L("Compartiment", "Compartment")} ${l.position}` : `${L("Ligne", "Line")} ${i + 1}`}{l.capacity ? <div className="text-xs text-muted-foreground">{L("max", "max")} {fmt(l.capacity)} L</div> : null}</div>
                  <div><Label className="text-xs">{L("Qté prévue (L)", "Planned (L)")}</Label><Input type="number" value={l.qty_litres} disabled={!!l.compartment_id} onChange={(e) => upd(i, { qty_litres: e.target.value })} /></div>
                  <div><Label className="text-xs">{L("Produit", "Product")}</Label>
                    <Select value={mode === "mono" ? monoProduct : l.product_id} disabled={mode === "mono"} onValueChange={(v) => upd(i, { product_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{orderProducts.map((p: Row) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">{L("Destination", "Destination")}</Label>
                    <Select value={l.destination_type} onValueChange={(v) => upd(i, { destination_type: v as "station" | "client" })}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="station">{L("Station", "Station")}</SelectItem><SelectItem value="client">{L("Client B2B", "B2B customer")}</SelectItem></SelectContent></Select></div>
                  <div><Label className="text-xs">{L("Site", "Site")}</Label>
                    {l.destination_type === "station"
                      ? <Select value={l.station_id} onValueChange={(v) => upd(i, { station_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{(d.stations ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
                      : <Select value={l.client_id} onValueChange={(v) => upd(i, { client_id: v })}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger><SelectContent>{(d.clients ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>}</div>
                  <div><Label className="text-xs">{L("Ordre d'arrêt", "Stop #")}</Label><Input type="number" min={1} value={l.stop_order} onChange={(e) => upd(i, { stop_order: e.target.value })} /></div>
                </div>
              ))}
              {!comps.length && <Button size="sm" variant="outline" onClick={() => setLines([...lines, blank({ qty_litres: String(Math.max(0, capacity - total)), stop_order: String(lines.length + 1) })])}><Plus className="h-4 w-4 mr-1" />{L("Ajouter une destination", "Add destination")}</Button>}
              <div className="rounded-md border border-border p-2 text-sm space-y-1">
                {Object.entries(byProduct).filter(([pid]) => pid).map(([pid, q]) => {
                  const over = q > (balances[pid] ?? 0);
                  return <div key={pid} className={over ? "text-destructive font-medium" : ""}>{name("products", pid)} : {fmt(q)} L {L("demandés", "requested")} / {fmt(balances[pid] ?? 0)} L {L("disponibles", "available")}{over && ` — ${L("dépassement du stock du dépôt", "exceeds depot stock")}`}</div>;
                })}
              </div>
            </div>
          )}
          {vehId && capacity <= 0 && <p className="text-sm text-destructive">{L("Ce véhicule n'a ni capacité ni compartiments configurés.", "This vehicle has no capacity or compartments configured.")}</p>}
          <div><Label>{L("Observations", "Notes")}</Label><Textarea value={f.observations ?? ""} onChange={(e) => setF({ ...f, observations: e.target.value })} /></div>
          <DialogFooter><Button disabled={busy || departing || !order || !vehId || total !== capacity || excess.length > 0} onClick={save}>{departing ? L("Départ vers le dépôt…", "Leaving for the depot…") : L("Établir le BE", "Draft lifting order")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signFor} onOpenChange={(o) => !o && setSignFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Signer le bon d'enlèvement", "Sign lifting order")} {signFor?.number}</DialogTitle></DialogHeader>
          <p className="text-sm">{L("En signant comme responsable logistique, vous validez le BE : il ne sera plus modifiable et sa quantité sera comptée comme enlevée sur le stock du dépôt.", "By signing as logistics manager you validate the order: it becomes read-only and its quantity counts as lifted on the PO.")} <b>{fmt(signFor?.total_litres)} L</b></p>
          <SignaturePad onChange={setPng} />
          <DialogFooter><Button disabled={busy || !png} onClick={async () => { if (await act("sign_lifting", { lifting_id: signFor!.id, signature_png: png }, L("BE signé", "Order signed"))) setSignFor(null); }}><CheckCircle2 className="h-4 w-4 mr-1" />{L("Signer et valider", "Sign and validate")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dirFor} onOpenChange={(o) => !o && setDirFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Visa du directeur d'exploitation", "Operations director visa")} {dirFor?.number}</DialogTitle></DialogHeader>
          <p className="text-sm">{L("Second visa du BE, après le responsable logistique (personne différente). Le dépôt ne signe pas le bon d'enlèvement.", "Second visa after the logistics manager (different person). The depot does not sign the lifting order.")}</p>
          <SignaturePad key={dirFor?.id} onChange={setPng} />
          <DialogFooter><Button disabled={busy || !png} onClick={async () => {
            setBusy(true); const { error } = await db.rpc("depot_lifting_director_sign", { _id: dirFor!.id, _png: png }); setBusy(false);
            if (error) return toast.error(error.message);
            toast.success(L("Visa enregistré", "Visa recorded")); setDirFor(null); load();
          }}><CheckCircle2 className="h-4 w-4 mr-1" />{L("Apposer le visa", "Sign")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Annuler le bon d'enlèvement", "Cancel lifting order")} {cancelFor?.number}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{L("La quantité revient au solde du bon de commande et le camion est libéré. L'annulation reste dans l'historique.", "The quantity returns to the PO balance and the truck is released. The cancellation stays in history.")}</p>
          <div><Label>{L("Motif (obligatoire)", "Reason (required)")}</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter><Button variant="destructive" disabled={busy || reason.trim().length < 5} onClick={async () => { if (await act("cancel_lifting", { lifting_id: cancelFor!.id, reason }, L("BE annulé", "Order cancelled"))) setCancelFor(null); }}>{L("Confirmer l'annulation", "Confirm cancellation")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{L("Historique", "History")} — {history?.number}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            {events.map((e) => (
              <div key={e.id} className="border-b border-border pb-2">
                <div className="font-medium">{e.action === "create" ? L("Établissement", "Drafted") : e.action === "sign" ? L("Signature responsable logistique", "Logistics manager signature") : L("Annulation", "Cancellation")}</div>
                <div className="text-xs text-muted-foreground">{fmtDt(e.created_at)} · {e.author_name ?? "—"}{e.reason && ` · ${e.reason}`}</div>
              </div>
            ))}
            {history?.signature_png && <img src={history.signature_png} alt={L("Signature", "Signature")} className="h-16 rounded border border-border bg-card" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
