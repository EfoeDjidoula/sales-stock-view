import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useCountry } from "@/hooks/useCountry";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { toast } from "sonner";
import { Plus, Pencil, History, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Opt = { value: string; label: string };

const STATUS_LABEL: Record<string, string> = { active: "Actif", inactive: "Inactif", maintenance: "Maintenance" };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default", inactive: "secondary", maintenance: "destructive",
};

interface Field {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "color";
  options?: Opt[] | ((form: Row) => Opt[]);
  required?: boolean;
  list?: boolean;
  render?: (v: unknown, row: Row) => string;
}

interface RefConfig {
  table: string;
  title: string;
  scope: "tenant_country" | "tenant" | "none";
  fields: Field[];
  statuses: string[];
  filterKey?: { key: string; label: string; options: Opt[] };
  allowCreate?: boolean;
  onBeforeSave?: (form: Row) => Row;
}

const useRows = (table: string, scope: RefConfig["scope"], reloadKey: number, countryFilter: string) => {
  const { tenantId, countryId } = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = db.from(table).select("*");
      if (scope === "tenant_country") {
        q = q.eq("tenant_id", tenantId);
        const c = countryFilter === "active" ? countryId : countryFilter;
        if (c && c !== "all") q = q.eq("country_id", c);
      }
      if (table === "stations" || table === "depots") q = q.order("name");
      else q = q.order("created_at");
      const { data, error } = await q;
      if (!cancelled) {
        if (error) toast.error(error.message);
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [table, scope, tenantId, countryId, reloadKey, countryFilter]);
  return { rows, loading };
};

const HistoryDialog = ({ row, table, onClose }: { row: Row | null; table: string; onClose: () => void }) => {
  const [logs, setLogs] = useState<Row[]>([]);
  useEffect(() => {
    if (!row) return;
    db.from("audit_logs").select("created_at,action,user_name,new_value,old_value")
      .eq("entity_type", table).eq("entity_id", row.id).order("created_at", { ascending: false }).limit(50)
      .then(({ data }: { data: Row[] | null }) => setLogs(data || []));
  }, [row, table]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Historique — {row?.name ?? row?.code}</DialogTitle></DialogHeader>
        <div className="text-sm space-y-1">
          <p>Créé le : {row?.created_at ? new Date(row.created_at).toLocaleString("fr-FR") : "—"}</p>
          <p>Modifié le : {row?.updated_at ? new Date(row.updated_at).toLocaleString("fr-FR") : "—"}</p>
        </div>
        <ul className="max-h-72 overflow-auto space-y-2 text-xs">
          {logs.map((l, i) => (
            <li key={i} className="p-2 rounded bg-secondary/50 border border-border">
              <span className="font-medium">{new Date(l.created_at).toLocaleString("fr-FR")}</span> · {l.action} · {l.user_name || "—"}
              {l.new_value && <pre className="whitespace-pre-wrap text-muted-foreground mt-1">{JSON.stringify(l.new_value)}</pre>}
            </li>
          ))}
          {logs.length === 0 && <li className="text-muted-foreground">Aucun événement détaillé disponible pour votre profil.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

const RefTable = ({ cfg, canEdit, countryFilter, countryName }: { cfg: RefConfig; canEdit: boolean; countryFilter: string; countryName: (id: string) => string }) => {
  const { scopeRow, tenantId } = useScope();
  const { isPlatformAdmin } = usePlatformAdmin();
  const [reload, setReload] = useState(0);
  const { rows, loading } = useRows(cfg.table, cfg.scope, reload, countryFilter);
  const showCountry = cfg.scope === "tenant_country" && countryFilter === "all";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [extra, setExtra] = useState("all");
  const [edit, setEdit] = useState<Row | null>(null);
  const [hist, setHist] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rows.filter((r) =>
      (status === "all" || r.status === status) &&
      (!cfg.filterKey || extra === "all" || r[cfg.filterKey.key] === extra) &&
      (!s || cfg.fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(s)))
    );
  }, [rows, search, status, extra, cfg]);

  const optsOf = (f: Field, form: Row) => (typeof f.options === "function" ? f.options(form) : f.options || []);
  const display = (f: Field, r: Row) => {
    if (f.render) return f.render(r[f.key], r);
    if (f.type === "select") return optsOf(f, r).find((o) => o.value === r[f.key])?.label ?? "—";
    const v = r[f.key];
    return v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);
  };
  const rowEditable = (r: Row) => canEdit && (cfg.scope !== "tenant" || r.tenant_id || isPlatformAdmin);

  const save = async () => {
    if (!edit) return;
    for (const f of cfg.fields) {
      if (f.required && (edit[f.key] === undefined || edit[f.key] === "" || edit[f.key] === null)) {
        toast.error(`« ${f.label} » est obligatoire`); return;
      }
      if (f.type === "number" && edit[f.key] !== "" && edit[f.key] != null && Number(edit[f.key]) < 0) {
        toast.error(`« ${f.label} » ne peut pas être négatif`); return;
      }
    }
    setSaving(true);
    let payload: Row = {};
    for (const f of cfg.fields) {
      const v = edit[f.key];
      payload[f.key] = v === "" || v === "__none" ? null : f.type === "number" && v != null ? Number(v) : v;
    }
    if (cfg.statuses.length) payload.status = edit.status || "active";
    if (cfg.onBeforeSave) payload = cfg.onBeforeSave(payload);
    let res;
    if (edit.id) res = await db.from(cfg.table).update(payload).eq("id", edit.id);
    else {
      const row = cfg.scope === "tenant_country" ? scopeRow(payload) : cfg.scope === "tenant" ? { ...payload, tenant_id: tenantId } : payload;
      res = await db.from(cfg.table).insert(row);
    }
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Enregistré");
    setEdit(null);
    setReload((n) => n + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {cfg.statuses.length > 0 && (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              {cfg.statuses.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {cfg.filterKey && (
          <Select value={extra} onValueChange={setExtra}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{cfg.filterKey.label} : tous</SelectItem>
              {cfg.filterKey.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {canEdit && cfg.allowCreate !== false && (
          <Button size="sm" className="gap-2" onClick={() => setEdit({ status: "active" })}><Plus className="w-4 h-4" /> Ajouter</Button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                {showCountry && <th className="text-left p-2 font-medium">Pays</th>}
                {cfg.fields.filter((f) => f.list !== false).map((f) => <th key={f.key} className="text-left p-2 font-medium">{f.label}</th>)}
                {cfg.statuses.length > 0 && <th className="text-left p-2 font-medium">Statut</th>}
                <th className="p-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  {showCountry && <td className="p-2">{countryName(r.country_id)}</td>}
                  {cfg.fields.filter((f) => f.list !== false).map((f) => (
                    <td key={f.key} className="p-2">
                      {f.type === "color" ? <span className="inline-block w-4 h-4 rounded-full border border-border" style={{ background: r[f.key] }} /> : display(f, r)}
                    </td>
                  ))}
                  {cfg.statuses.length > 0 && (
                    <td className="p-2"><Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  )}
                  <td className="p-2 whitespace-nowrap text-right">
                    {cfg.scope === "tenant" && !r.tenant_id && <Badge variant="outline" className="mr-1">Commun</Badge>}
                    <Button variant="ghost" size="icon" aria-label="Historique" onClick={() => setHist(r)}><History className="w-4 h-4" /></Button>
                    {rowEditable(r) && (
                      <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEdit({ ...r })}><Pencil className="w-4 h-4" /></Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={99} className="p-6 text-center text-muted-foreground">Aucun élément</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifier" : "Ajouter"} — {cfg.title}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              {cfg.fields.map((f) => (
                <div key={f.key} className="grid gap-1">
                  <Label htmlFor={`f-${f.key}`}>{f.label}{f.required && " *"}</Label>
                  {f.type === "select" ? (
                    <Select value={edit[f.key] ?? "__none"} onValueChange={(v) => setEdit({ ...edit, [f.key]: v === "__none" ? null : v })}>
                      <SelectTrigger id={`f-${f.key}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {!f.required && <SelectItem value="__none">— Aucun —</SelectItem>}
                        {optsOf(f, edit).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id={`f-${f.key}`} type={f.type === "number" ? "number" : f.type === "color" ? "color" : "text"}
                      min={f.type === "number" ? 0 : undefined}
                      value={edit[f.key] ?? ""} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                  )}
                </div>
              ))}
              {cfg.statuses.length > 0 && (
                <div className="grid gap-1">
                  <Label htmlFor="f-status">Statut</Label>
                  <Select value={edit.status || "active"} onValueChange={(v) => setEdit({ ...edit, status: v })}>
                    <SelectTrigger id="f-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{cfg.statuses.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <HistoryDialog row={hist} table={cfg.table} onClose={() => setHist(null)} />
    </div>
  );
};

/** Charge les listes de référence utilisées par les menus déroulants. */
const useLookups = (reloadKey: number) => {
  const { tenantId } = useScope();
  const scopeQuery = (q: any) => q.eq("tenant_id", tenantId); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<Record<string, Row[]>>({});
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [products, depots, stations, tanks, pumps, units, types] = await Promise.all([
        scopeQuery(db.from("petroleum_products").select("id,name,code")).order("position"),
        scopeQuery(db.from("depots").select("id,name")).order("name"),
        scopeQuery(db.from("stations").select("id,name")).order("name"),
        scopeQuery(db.from("tanks").select("id,name,station_id,product_id")).order("name"),
        scopeQuery(db.from("pumps").select("id,name,station_id")).order("name"),
        db.from("units_of_measure").select("id,name,code").order("name"),
        db.from("equipment_types").select("id,name,category").order("name"),
      ]);
      setData({
        products: products.data || [], depots: depots.data || [], stations: stations.data || [],
        tanks: tanks.data || [], pumps: pumps.data || [], units: units.data || [], types: types.data || [],
      });
    })();
  }, [tenantId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
};

export const ReferentialsModule = ({ canEdit }: { canEdit: boolean }) => {
  const [tab, setTab] = useState("produits");
  const { countries } = useCountry();
  const [countryFilter, setCountryFilter] = useState("active");
  const countryName = (id: string) => countries.find((c) => c.id === id)?.name ?? "—";
  const L = useLookups(tab.length); // recharge au changement d'onglet
  const opt = (rows: Row[] = []) => rows.map((r) => ({ value: r.id, label: r.code ? `${r.name} (${r.code})` : r.name }));
  const types = (cat: string) => opt((L.types || []).filter((t) => t.category === cat));
  const S3 = ["active", "inactive", "maintenance"];

  const configs: Record<string, RefConfig> = {
    produits: {
      table: "petroleum_products", title: "Produits", scope: "tenant_country", statuses: ["active", "inactive"],
      fields: [
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Nom", required: true },
        { key: "category", label: "Catégorie" },
        { key: "unit_id", label: "Unité", type: "select", options: opt(L.units) },
        { key: "density", label: "Densité", type: "number" },
        { key: "color", label: "Couleur", type: "color" },
      ],
    },
    depots: {
      table: "depots", title: "Dépôts", scope: "tenant_country", statuses: S3,
      fields: [
        { key: "code", label: "Code" },
        { key: "name", label: "Nom", required: true },
        { key: "location", label: "Localisation" },
        { key: "equipment_type_id", label: "Type", type: "select", options: types("depot") },
        { key: "capacity_liters", label: "Capacité (L)", type: "number" },
      ],
    },
    stations: {
      table: "stations", title: "Stations", scope: "tenant_country", statuses: S3, allowCreate: false,
      fields: [
        { key: "name", label: "Nom", required: true },
        { key: "location", label: "Localisation", required: true },
        { key: "depot_id", label: "Dépôt d'approvisionnement", type: "select", options: opt(L.depots) },
      ],
    },
    cuves: {
      table: "tanks", title: "Cuves", scope: "tenant_country", statuses: S3, allowCreate: false,
      filterKey: { key: "station_id", label: "Station", options: opt(L.stations) },
      fields: [
        { key: "station_id", label: "Station", type: "select", options: opt(L.stations), required: true },
        { key: "name", label: "Nom", required: true },
        { key: "product_id", label: "Produit", type: "select", options: opt(L.products), required: true },
        { key: "capacity_liters", label: "Capacité (L)", type: "number", required: true },
        { key: "equipment_type_id", label: "Type", type: "select", options: types("tank") },
        { key: "unit_id", label: "Unité", type: "select", options: opt(L.units), list: false },
      ],
      onBeforeSave: (f) => {
        const p = (L.products || []).find((x) => x.id === f.product_id);
        return p && (p.code === "super" || p.code === "gasoil") ? { ...f, product_type: p.code } : f;
      },
    },
    pompes: {
      table: "pumps", title: "Pompes", scope: "tenant_country", statuses: S3, allowCreate: false,
      filterKey: { key: "station_id", label: "Station", options: opt(L.stations) },
      fields: [
        { key: "station_id", label: "Station", type: "select", options: opt(L.stations), required: true },
        { key: "name", label: "Nom", required: true },
        { key: "product_id", label: "Produit", type: "select", options: opt(L.products) },
        { key: "equipment_type_id", label: "Type", type: "select", options: types("pump") },
      ],
    },
    pistolets: {
      table: "nozzles", title: "Pistolets", scope: "tenant_country", statuses: S3,
      filterKey: { key: "station_id", label: "Station", options: opt(L.stations) },
      fields: [
        { key: "station_id", label: "Station", type: "select", options: opt(L.stations), required: true },
        { key: "pump_id", label: "Pompe", type: "select", required: true,
          options: (f) => opt((L.pumps || []).filter((p) => !f.station_id || p.station_id === f.station_id)) },
        { key: "number", label: "N°", type: "number", required: true },
        { key: "name", label: "Nom", required: true },
        { key: "tank_id", label: "Cuve", type: "select",
          options: (f) => opt((L.tanks || []).filter((t) => !f.station_id || t.station_id === f.station_id)) },
        { key: "product_id", label: "Produit", type: "select", options: opt(L.products) },
        { key: "equipment_type_id", label: "Type", type: "select", options: types("nozzle"), list: false },
      ],
    },
    unites: {
      table: "units_of_measure", title: "Unités", scope: "tenant", statuses: ["active", "inactive"],
      fields: [
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Nom", required: true },
        { key: "kind", label: "Nature", type: "select", required: true, options: [
          { value: "volume", label: "Volume" }, { value: "mass", label: "Masse" }, { value: "count", label: "Comptage" }, { value: "other", label: "Autre" }] },
        { key: "factor_to_base", label: "Facteur (vers L / kg)", type: "number", required: true },
      ],
    },
    types: {
      table: "equipment_types", title: "Types d'équipements", scope: "tenant", statuses: ["active", "inactive"],
      fields: [
        { key: "category", label: "Catégorie", type: "select", required: true, options: [
          { value: "tank", label: "Cuve" }, { value: "pump", label: "Pompe" }, { value: "nozzle", label: "Pistolet" },
          { value: "depot", label: "Dépôt" }, { value: "other", label: "Autre" }] },
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Nom", required: true },
        { key: "description", label: "Description" },
      ],
    },
  };

  const labels: Record<string, string> = {
    produits: "Produits", depots: "Dépôts", stations: "Stations", cuves: "Cuves", pompes: "Pompes",
    pistolets: "Pistolets", capacites: "Capacités", unites: "Unités", types: "Types d'équipements",
  };
  const order = ["produits", "depots", "stations", "cuves", "pompes", "pistolets", "capacites", "unites", "types"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Référentiels pétroliers</h2>
          <p className="text-sm text-muted-foreground">Produits, dépôts, équipements, capacités et statuts.</p>
        </div>
        {countries.length > 1 && (
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-56" aria-label="Filtre pays"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Pays actif</SelectItem>
              <SelectItem value="all">Tous mes pays</SelectItem>
              {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary flex-wrap h-auto">
          {order.map((k) => <TabsTrigger key={k} value={k}>{labels[k]}</TabsTrigger>)}
        </TabsList>
        {Object.entries(configs).map(([k, cfg]) => (
          <TabsContent key={k} value={k} className="mt-4">
            <RefTable cfg={cfg} canEdit={canEdit} countryFilter={countryFilter} countryName={countryName} />
          </TabsContent>
        ))}
        <TabsContent value="capacites" className="mt-4">
          <CapacityView countryFilter={countryFilter} countryName={countryName} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

/** Capacités installées par station et par produit (somme des cuves actives). */
const CapacityView = ({ countryFilter, countryName }: { countryFilter: string; countryName: (id: string) => string }) => {
  const { tenantId, countryId } = useScope();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!tenantId) return;
    let q = db.from("tanks").select("capacity_liters,status,country_id,stations(name),petroleum_products(name)").eq("tenant_id", tenantId);
    const c = countryFilter === "active" ? countryId : countryFilter;
    if (c && c !== "all") q = q.eq("country_id", c);
    q.then(({ data }: { data: Row[] | null }) => {
      const map = new Map<string, Row>();
      for (const t of data || []) {
        const key = `${t.country_id}|${t.stations?.name}|${t.petroleum_products?.name}`;
        const cur = map.get(key) || { country_id: t.country_id, station: t.stations?.name ?? "—", product: t.petroleum_products?.name ?? "—", total: 0, active: 0, count: 0 };
        cur.total += Number(t.capacity_liters) || 0;
        if (t.status === "active") cur.active += Number(t.capacity_liters) || 0;
        cur.count += 1;
        map.set(key, cur);
      }
      setRows([...map.values()].sort((a, b) => a.station.localeCompare(b.station)));
    });
  }, [tenantId, countryId, countryFilter]);
  const s = search.toLowerCase();
  const list = rows.filter((r) => !s || `${r.station} ${r.product}`.toLowerCase().includes(s));
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input className="pl-8" placeholder="Rechercher une station ou un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground">
            <tr>{["Pays", "Station", "Produit", "Cuves", "Capacité totale (L)", "Capacité active (L)"].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="p-2">{countryName(r.country_id)}</td><td className="p-2">{r.station}</td><td className="p-2">{r.product}</td>
                <td className="p-2">{r.count}</td><td className="p-2">{r.total.toLocaleString("fr-FR")}</td><td className="p-2">{r.active.toLocaleString("fr-FR")}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Aucune cuve</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
