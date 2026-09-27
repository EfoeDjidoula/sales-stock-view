import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { toast } from "sonner";
import { Loader2, Search, Check, X, ArrowRightLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PendingTab, LedgerTab, VarianceTab, SummaryTab, TransfersTab, ThresholdsTab } from "./StockAnalysisTabs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fmt = (n: unknown) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }));

export const MOVEMENT_LABEL: Record<string, string> = {
  initial: "Stock initial", entry: "Entrée", exit: "Sortie", sale: "Vente",
  transfer_out: "Transfert sortant", transfer_in: "Transfert entrant",
  adjustment_in: "Ajustement +", adjustment_out: "Ajustement −", inventory: "Inventaire / jaugeage",
};
const ALERT_META: Record<string, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-success/15 text-success border-success/30" },
  faible: { label: "Stock faible", cls: "bg-warning/15 text-warning border-warning/30" },
  critique: { label: "Critique", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  rupture: { label: "Rupture", cls: "bg-destructive text-destructive-foreground border-destructive" },
};
const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  validated: { label: "Validé", variant: "default" },
  pending: { label: "En attente", variant: "outline" },
  rejected: { label: "Rejeté", variant: "destructive" },
};

const useRefs = () => {
  const { scopeQuery, tenantId } = useScope();
  const [refs, setRefs] = useState<Record<string, Row[]>>({ stations: [], depots: [], tanks: [], products: [] });
  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      scopeQuery(db.from("stations").select("id,name")).order("name"),
      scopeQuery(db.from("depots").select("id,name")).order("name"),
      scopeQuery(db.from("tanks").select("id,name,station_id,product_id,capacity_liters")).order("name"),
      scopeQuery(db.from("petroleum_products").select("id,name,code")).eq("status", "active").order("position"),
    ]).then(([s, d, t, p]) => setRefs({ stations: s.data || [], depots: d.data || [], tanks: t.data || [], products: p.data || [] }));
  }, [scopeQuery, tenantId]);
  return refs;
};

/** Sélecteur emplacement : station/dépôt + cuve (station uniquement). */
const LocationPicker = ({ refs, value, onChange, label, allowDepot = true }: {
  refs: Record<string, Row[]>; value: Row; onChange: (v: Row) => void; label: string; allowDepot?: boolean;
}) => {
  const tanks = refs.tanks.filter((t) => t.station_id === value.id);
  return (
    <div className="grid gap-2 p-3 rounded-lg border border-border bg-secondary/30">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid sm:grid-cols-3 gap-2">
        <Select value={value.type} onValueChange={(v) => onChange({ type: v, id: "", tank: "" })}>
          <SelectTrigger aria-label={`${label} type`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="station">Station</SelectItem>
            {allowDepot && <SelectItem value="depot">Dépôt</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={value.id || undefined} onValueChange={(v) => onChange({ ...value, id: v, tank: "" })}>
          <SelectTrigger aria-label={`${label} emplacement`}><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            {(value.type === "station" ? refs.stations : refs.depots).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {value.type === "station" && (
          <Select value={value.tank || undefined} onValueChange={(v) => onChange({ ...value, tank: v })}>
            <SelectTrigger aria-label={`${label} cuve`}><SelectValue placeholder="Cuve…" /></SelectTrigger>
            <SelectContent>{tanks.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({fmt(t.capacity_liters)} L)</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
};

const LevelsTab = ({ refs, reload }: { refs: Record<string, Row[]>; reload: number }) => {
  const { scopeQuery, tenantId } = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [alert, setAlert] = useState("all");
  const [loc, setLoc] = useState("all");
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    scopeQuery(db.from("stock_levels").select("*")).then(({ data, error }: { data: Row[] | null; error: Error | null }) => {
      if (error) toast.error(error.message);
      setRows(data || []);
      setLoading(false);
    });
  }, [scopeQuery, tenantId, reload]);
  const name = (list: Row[], id: string) => list.find((r) => r.id === id)?.name ?? "—";
  const list = useMemo((): Row[] => rows.map((r): Row => ({
    ...r,
    locName: r.location_type === "station" ? name(refs.stations, r.station_id) : name(refs.depots, r.depot_id),
    tankName: r.tank_id ? name(refs.tanks, r.tank_id) : "—",
    productName: name(refs.products, r.product_id),
  })).filter((r) =>
    (alert === "all" || r.alert_level === alert) && (loc === "all" || r.location_type === loc) &&
    (!search || `${r.locName} ${r.tankName} ${r.productName}`.toLowerCase().includes(search.toLowerCase()))
  ), [rows, refs, search, alert, loc]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => rows.reduce((a: Record<string, number>, r) => ({ ...a, [r.alert_level]: (a[r.alert_level] || 0) + 1 }), {}), [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(ALERT_META).map(([k, m]) => (
          <button key={k} onClick={() => setAlert(alert === k ? "all" : k)} className={`rounded-xl border p-3 text-left ${m.cls} ${alert === k ? "ring-2 ring-ring" : ""}`}>
            <div className="text-xs">{m.label}</div>
            <div className="text-2xl font-display font-bold">{counts[k] || 0}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Rechercher station, dépôt, cuve, produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={loc} onValueChange={setLoc}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Stations et dépôts</SelectItem>
            <SelectItem value="station">Stations</SelectItem>
            <SelectItem value="depot">Dépôts</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>{["Emplacement", "Cuve", "Produit", "Initial", "Entrées", "Sorties", "Ventes", "Théorique", "Physique", "Écart", "Seuils (min / crit.)", "Alerte"].map((h) => <th key={h} className="text-left p-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{r.locName}<span className="text-xs text-muted-foreground ml-1">({r.location_type === "station" ? "station" : "dépôt"})</span></td>
                  <td className="p-2">{r.tankName}</td><td className="p-2">{r.productName}</td>
                  <td className="p-2">{fmt(r.initial_qty)}</td><td className="p-2">{fmt(r.entries)}</td><td className="p-2">{fmt(r.exits)}</td><td className="p-2">{fmt(r.sales)}</td>
                  <td className="p-2 font-semibold">{fmt(r.theoretical)}</td>
                  <td className="p-2">{fmt(r.physical)}</td>
                  <td className={`p-2 ${r.variance < 0 ? "text-destructive" : r.variance > 0 ? "text-success" : ""}`}>{fmt(r.variance)}</td>
                  <td className="p-2 whitespace-nowrap">{fmt(r.min_threshold)} / {fmt(r.critical_threshold)}</td>
                  <td className="p-2"><span className={`px-2 py-0.5 rounded-full border text-xs ${ALERT_META[r.alert_level]?.cls}`}>{ALERT_META[r.alert_level]?.label}</span></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Aucun stock enregistré. Commencez par saisir un stock initial.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Stock théorique = Stock initial + Entrées − Sorties (ventes incluses). Seuils par défaut : 25 % et 10 % de la capacité.</p>
    </div>
  );
};

const RegisterTab = ({ refs, reload, onChanged }: { refs: Record<string, Row[]>; reload: number; onChanged: () => void }) => {
  const { scopeQuery, tenantId } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canValidate = isPlatformAdmin || can("stock", "validate");
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const load = useCallback(() => {
    if (!tenantId) return;
    scopeQuery(db.from("stock_movements").select("*")).order("created_at", { ascending: false }).limit(500)
      .then(({ data }: { data: Row[] | null }) => setRows(data || []));
  }, [scopeQuery, tenantId]);
  useEffect(load, [load, reload]);
  const name = (list: Row[], id: string) => list.find((r) => r.id === id)?.name ?? "";
  const decide = async (r: Row, next: "validated" | "rejected") => {
    const note = next === "rejected" ? window.prompt("Motif du rejet ?") : null;
    if (next === "rejected" && !note) return;
    const { error } = await db.from("stock_movements").update({ status: next, validation_note: note }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(next === "validated" ? "Mouvement validé" : "Mouvement rejeté");
    load(); onChanged();
  };
  const list = rows.filter((r) => (type === "all" || r.movement_type === type) && (status === "all" || r.status === status) &&
    (!search || `${name(refs.stations, r.station_id)} ${name(refs.depots, r.depot_id)} ${r.reason ?? ""} ${r.reference ?? ""} ${r.requested_by_name ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Rechercher emplacement, motif, référence, utilisateur…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tous types</SelectItem>{Object.entries(MOVEMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tous statuts</SelectItem>{Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground">
            <tr>{["Date", "Type", "Emplacement", "Cuve", "Produit", "Quantité", "Motif / réf.", "Par", "Statut", ""].map((h, i) => <th key={i} className="text-left p-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-2 whitespace-nowrap">{new Date(r.movement_date).toLocaleString("fr-FR")}</td>
                <td className="p-2">{MOVEMENT_LABEL[r.movement_type]}{r.transfer_id && <ArrowRightLeft className="inline w-3 h-3 ml-1 text-primary" />}</td>
                <td className="p-2">{name(refs.stations, r.station_id) || name(refs.depots, r.depot_id)}</td>
                <td className="p-2">{name(refs.tanks, r.tank_id) || "—"}</td>
                <td className="p-2">{name(refs.products, r.product_id)}</td>
                <td className="p-2 whitespace-nowrap">{r.movement_type === "inventory" ? `mesuré ${fmt(r.physical_level)} (théo. ${fmt(r.theoretical_at_count)})` : `${fmt(r.quantity)} L`}</td>
                <td className="p-2 max-w-[220px]">{r.reason || "—"}{r.reference && <div className="text-xs text-muted-foreground">Réf. {r.reference}</div>}{r.validation_note && <div className="text-xs text-destructive">{r.validation_note}</div>}</td>
                <td className="p-2">{r.requested_by_name || "—"}</td>
                <td className="p-2"><Badge variant={STATUS_META[r.status].variant}>{STATUS_META[r.status].label}</Badge></td>
                <td className="p-2 whitespace-nowrap">
                  {r.status === "pending" && canValidate && (
                    <>
                      <Button size="icon" variant="ghost" aria-label="Valider" onClick={() => decide(r, "validated")}><Check className="w-4 h-4 text-success" /></Button>
                      <Button size="icon" variant="ghost" aria-label="Rejeter" onClick={() => decide(r, "rejected")}><X className="w-4 h-4 text-destructive" /></Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Aucun mouvement</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Registre immuable : aucun mouvement ne peut être modifié ni supprimé. Une erreur se corrige par un ajustement motivé.</p>
    </div>
  );
};

const MovementForm = ({ refs, onDone }: { refs: Record<string, Row[]>; onDone: () => void }) => {
  const { scopeRow } = useScope();
  const [type, setType] = useState("entry");
  const [loc, setLoc] = useState<Row>({ type: "station", id: "", tank: "" });
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const tank = refs.tanks.find((t) => t.id === loc.tank);
  const productId = tank?.product_id || product;
  const needsReason = ["adjustment_in", "adjustment_out", "inventory"].includes(type);

  const submit = async () => {
    const n = Number(qty);
    if (!loc.id) return toast.error("Choisissez un emplacement");
    if (!productId) return toast.error("Choisissez un produit");
    if (!(n >= 0) || qty === "" || (type !== "inventory" && n <= 0)) return toast.error("Quantité invalide (nombre positif)");
    if (needsReason && !reason.trim()) return toast.error("Le motif est obligatoire");
    setSaving(true);
    const { data, error } = await db.from("stock_movements").insert(scopeRow({
      location_type: loc.type,
      station_id: loc.type === "station" ? loc.id : null,
      depot_id: loc.type === "depot" ? loc.id : null,
      tank_id: loc.type === "station" ? loc.tank || null : null,
      product_id: productId,
      movement_type: type,
      quantity: type === "inventory" ? 0 : n,
      physical_level: type === "inventory" ? n : null,
      reason: reason || null,
      reference: reference || null,
    })).select("status").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(data?.status === "pending" ? "Mouvement enregistré — en attente de validation" : "Mouvement enregistré");
    setQty(""); setReason(""); setReference("");
    onDone();
  };

  return (
    <div className="grid gap-3 max-w-3xl">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="mv-type">Type de mouvement</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="mv-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["initial", "entry", "exit", "sale", "adjustment_in", "adjustment_out", "inventory"].map((k) => <SelectItem key={k} value={k}>{MOVEMENT_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mv-product">Produit</Label>
          <Select value={productId || undefined} onValueChange={setProduct} disabled={!!tank?.product_id}>
            <SelectTrigger id="mv-product"><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>{refs.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <LocationPicker refs={refs} value={loc} onChange={setLoc} label="Emplacement" />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="mv-qty">{type === "inventory" ? "Niveau physique mesuré (L)" : "Quantité (L)"}</Label>
          <Input id="mv-qty" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="mv-ref">Référence (BL, bon, ticket…)</Label>
          <Input id="mv-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="mv-reason">Motif{needsReason && " *"}</Label>
        <Textarea id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </div>
      {(needsReason || type === "initial") && (
        <p className="text-xs text-muted-foreground">Ce mouvement sera en attente de validation si vous n'avez pas le droit de valider le stock.</p>
      )}
      <div><Button onClick={submit} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Enregistrer le mouvement</Button></div>
    </div>
  );
};

const TransferForm = ({ refs, onDone }: { refs: Record<string, Row[]>; onDone: () => void }) => {
  const [from, setFrom] = useState<Row>({ type: "depot", id: "", tank: "" });
  const [to, setTo] = useState<Row>({ type: "station", id: "", tank: "" });
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const fromTank = refs.tanks.find((t) => t.id === from.tank);
  const productId = fromTank?.product_id || product;

  const submit = async () => {
    const n = Number(qty);
    if (!from.id || !to.id) return toast.error("Choisissez l'origine et la destination");
    if (from.type === "station" && to.type === "depot") return toast.error("Transfert station → dépôt non autorisé");
    if (!productId) return toast.error("Choisissez un produit");
    if (!(n > 0)) return toast.error("Quantité invalide");
    setSaving(true);
    const { error } = await db.rpc("create_stock_transfer", {
      _from_type: from.type, _from_id: from.id, _from_tank: from.tank || null,
      _to_type: to.type, _to_id: to.id, _to_tank: to.tank || null,
      _product_id: productId, _quantity: n, _reason: reason || null, _reference: reference || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transfert enregistré");
    setQty(""); setReason(""); setReference("");
    onDone();
  };

  return (
    <div className="grid gap-3 max-w-3xl">
      <p className="text-sm text-muted-foreground">Transferts autorisés : dépôt → station, station → station, dépôt → dépôt, au sein du même pays.</p>
      <LocationPicker refs={refs} value={from} onChange={setFrom} label="Origine" />
      <LocationPicker refs={refs} value={to} onChange={setTo} label="Destination" allowDepot={from.type === "depot"} />
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="grid gap-1">
          <Label htmlFor="tr-product">Produit</Label>
          <Select value={productId || undefined} onValueChange={setProduct} disabled={!!fromTank?.product_id}>
            <SelectTrigger id="tr-product"><SelectValue placeholder="Choisir…" /></SelectTrigger>
            <SelectContent>{refs.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-qty">Quantité (L)</Label>
          <Input id="tr-qty" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-ref">Référence</Label>
          <Input id="tr-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="tr-reason">Motif</Label>
        <Textarea id="tr-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </div>
      <div><Button onClick={submit} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}Enregistrer le transfert</Button></div>
    </div>
  );
};

export const StockEngineModule = () => {
  const refs = useRefs();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canWrite = isPlatformAdmin || ["create", "edit", "validate", "administer"].some((a) => can("stock", a as never));
  const [tab, setTab] = useState("niveaux");
  const [reload, setReload] = useState(0);
  const bump = () => setReload((n) => n + 1);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-semibold">Moteur de stock</h2>
        <p className="text-sm text-muted-foreground">Stocks par pays, dépôt, station, cuve et produit — registre de mouvements tracé.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary flex-wrap h-auto">
          <TabsTrigger value="niveaux">Niveaux & alertes</TabsTrigger>
          <TabsTrigger value="synthese">Synthèse par produit</TabsTrigger>
          <TabsTrigger value="fiche">Fiche de stock</TabsTrigger>
          <TabsTrigger value="registre">Registre des mouvements</TabsTrigger>
          <TabsTrigger value="validations">Validations en attente</TabsTrigger>
          <TabsTrigger value="ecarts">Écarts d'inventaire</TabsTrigger>
          <TabsTrigger value="transferts">Suivi des transferts</TabsTrigger>
          <TabsTrigger value="seuils">Seuils d'alerte</TabsTrigger>
          {canWrite && <TabsTrigger value="mouvement">Nouveau mouvement</TabsTrigger>}
          {canWrite && <TabsTrigger value="transfert">Transfert</TabsTrigger>}
        </TabsList>
        <TabsContent value="niveaux" className="mt-4"><LevelsTab refs={refs} reload={reload} /></TabsContent>
        <TabsContent value="synthese" className="mt-4"><SummaryTab refs={refs} reload={reload} /></TabsContent>
        <TabsContent value="fiche" className="mt-4"><LedgerTab refs={refs} reload={reload} /></TabsContent>
        <TabsContent value="registre" className="mt-4"><RegisterTab refs={refs} reload={reload} onChanged={bump} /></TabsContent>
        <TabsContent value="validations" className="mt-4"><PendingTab refs={refs} reload={reload} onChanged={bump} canValidate={isPlatformAdmin || can("stock", "validate")} /></TabsContent>
        <TabsContent value="ecarts" className="mt-4"><VarianceTab refs={refs} reload={reload} /></TabsContent>
        <TabsContent value="transferts" className="mt-4"><TransfersTab refs={refs} reload={reload} /></TabsContent>
        <TabsContent value="seuils" className="mt-4"><ThresholdsTab refs={refs} onChanged={bump} canEdit={isPlatformAdmin || can("tanks", "edit") || can("stations", "edit")} /></TabsContent>
        {canWrite && <TabsContent value="mouvement" className="mt-4"><MovementForm refs={refs} onDone={() => { bump(); setTab("registre"); }} /></TabsContent>}
        {canWrite && <TabsContent value="transfert" className="mt-4"><TransferForm refs={refs} onDone={() => { bump(); setTab("registre"); }} /></TabsContent>}
      </Tabs>
    </div>
  );
};
