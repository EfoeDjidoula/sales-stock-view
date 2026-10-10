import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";
import { Loader2, Plus, Eye, AlertTriangle, MapPin } from "lucide-react";
import { LogisticsMap } from "./LogisticsMap";
import { LoadPlanDialog } from "./LoadPlanDialog";
import { SupplyWorkflowModule } from "@/components/supply/SupplyWorkflowModule";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const TRIP_STATUS: Record<string, [string, string]> = {
  planned: ["Planifié", "Planned"], loading: ["Au chargement", "Loading"], loaded: ["Chargé", "Loaded"],
  in_transit: ["En transit", "In transit"], arrived: ["Arrivé", "Arrived"], unloading: ["Déchargement", "Unloading"],
  delivered: ["Livré", "Delivered"], incident: ["Incident", "Incident"],
};
const NEXT: Record<string, [string, string, string]> = {
  planned: ["start_loading", "Début chargement", "Start loading"],
  loading: ["finish_loading", "Fin de chargement", "Finish loading"],
  loaded: ["depart", "Départ", "Depart"],
  in_transit: ["arrive", "Arrivée station", "Arrival"],
  arrived: ["start_unloading", "Début déchargement", "Start unloading"],
  unloading: ["deliver", "Livraison terminée", "Delivered"],
};
const KIND: Record<string, [string, string]> = { truck: ["Camion porteur", "Rigid truck"], tractor: ["Tracteur", "Tractor"], tanker: ["Citerne", "Tanker trailer"] };
const ALERT: Record<string, [string, string]> = {
  document_expired: ["Document expiré / à échéance", "Document expired / due"],
  delivery_late: ["Retard de livraison", "Late delivery"],
  quantity_variance: ["Écart de quantité", "Quantity variance"],
  seal_broken: ["Scellé rompu", "Broken seal"],
};
const DOC_TYPES = ["Assurance", "Visite technique", "Carte grise", "Permis poids lourd", "Attestation ADR", "Certificat de jaugeage", "Autre"];
const fmt = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const fmtDt = (d?: string) => (d ? format(new Date(d), "dd/MM/yyyy HH:mm") : "—");
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? String(e);

type Field = { k: string; fr: string; en: string; type?: "text" | "number" | "date" | "datetime" | "select" | "textarea"; options?: { v: string; l: string }[] };

export const LogisticsModule = () => {
  const { language } = useLanguage();
  const L = (fr: string, en: string) => (language === "en" ? en : fr);
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const canWrite = isPlatformAdmin || can("supplies", "create") || can("supplies", "edit") || can("supplies", "validate");

  const [d, setD] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{ table: string; title: string; fields: Field[]; values: Row; id?: string } | null>(null);
  const [action, setAction] = useState<{ trip: Row; action: string; title: string } | null>(null);
  const [actionData, setActionData] = useState<Row>({});
  const [detail, setDetail] = useState<Row | null>(null);
  const [events, setEvents] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [planTrip, setPlanTrip] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const q = (t: string, sel = "*") => scopeQuery(db.from(t).select(sel));
    const res = await Promise.all([
      q("logistics_trips").order("created_at", { ascending: false }).limit(300),
      q("logistics_carriers").order("name"),
      q("logistics_vehicles").order("registration"),
      q("logistics_compartments").order("position"),
      q("logistics_drivers").order("full_name"),
      q("logistics_documents").order("expires_on"),
      q("logistics_seals").order("serial"),
      q("logistics_alerts"),
      q("supply_requests", "id,reference,status").not("status", "in", "(received,cancelled,rejected)"),
      q("logistics_trip_loads"),
      q("petroleum_products", "id,name,code"),
      q("stations", "id,name").order("name"),
      db.from("clients").select("id,name").eq("tenant_id", tenantId).order("name"),
    ]);
    const keys = ["trips", "carriers", "vehicles", "compartments", "drivers", "documents", "seals", "alerts", "supplies", "loads", "products", "stations", "clients"];
    const out: Record<string, Row[]> = {};
    res.forEach((r: Row, i: number) => { out[keys[i]] = r.data ?? []; if (r.error) console.error(keys[i], r.error); });
    setD(out);
    setLoading(false);
  }, [tenantId, countryId, scopeQuery]);
  useEffect(() => { load(); }, [load]);

  const name = (list: string, id?: string, key = "name") => (d[list] ?? []).find((x) => x.id === id)?.[key] ?? "—";
  const opts = (list: string, key: string, filter?: (x: Row) => boolean) => (d[list] ?? []).filter(filter ?? (() => true)).map((x) => ({ v: x.id, l: x[key] }));
  const statusOpts = (s: string[]) => s.map((v) => ({ v, l: v }));

  const openForm = (table: string, title: string, fields: Field[], row?: Row) =>
    setDialog({ table, title, fields, values: row ? { ...row } : {}, id: row?.id });

  const saveForm = async () => {
    if (!dialog) return;
    setBusy(true);
    const payload: Row = {};
    dialog.fields.forEach((f) => { const v = dialog.values[f.k]; payload[f.k] = v === "" || v === undefined ? null : f.type === "number" ? Number(v) : v; });
    if (dialog.table === "logistics_documents") {
      payload.entity_type = payload.vehicle_id ? "vehicle" : "driver";
      if (payload.vehicle_id) payload.driver_id = null;
    }
    const { error } = dialog.id
      ? await db.from(dialog.table).update(payload).eq("id", dialog.id)
      : await db.from(dialog.table).insert({ ...payload, tenant_id: tenantId, country_id: countryId });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(L("Enregistré", "Saved"));
    setDialog(null); load();
  };

  const runAction = async (tripId: string | null, act: string, reason?: string, data: Row = {}) => {
    setBusy(true);
    const { error } = await db.rpc("logistics_trip_action", { _id: tripId, _action: act, _reason: reason ?? null, _data: data });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return false; }
    toast.success(L("Transport mis à jour", "Trip updated"));
    load(); return true;
  };

  const openDetail = async (t: Row) => {
    setDetail(t);
    const { data } = await db.from("logistics_trip_events").select("*").eq("trip_id", t.id).order("created_at");
    setEvents(data ?? []);
  };

  const F = {
    carrier: [
      { k: "name", fr: "Raison sociale", en: "Company name" }, { k: "code", fr: "Code", en: "Code" },
      { k: "phone", fr: "Téléphone", en: "Phone" }, { k: "email", fr: "Email", en: "Email" }, { k: "address", fr: "Adresse", en: "Address" },
      { k: "status", fr: "Statut", en: "Status", type: "select", options: statusOpts(["active", "inactive"]) },
    ] as Field[],
    vehicle: [
      { k: "kind", fr: "Type", en: "Type", type: "select", options: Object.entries(KIND).map(([v, l]) => ({ v, l: L(l[0], l[1]) })) },
      { k: "registration", fr: "Immatriculation", en: "Registration" },
      { k: "carrier_id", fr: "Transporteur", en: "Carrier", type: "select", options: opts("carriers", "name") },
      { k: "brand", fr: "Marque", en: "Brand" }, { k: "model", fr: "Modèle", en: "Model" }, { k: "vin", fr: "N° châssis", en: "VIN" },
      { k: "capacity_litres", fr: "Capacité (L)", en: "Capacity (L)", type: "number" },
      { k: "gps_device_id", fr: "ID boîtier GPS (futur)", en: "GPS device ID (future)" },
      { k: "status", fr: "Statut", en: "Status", type: "select", options: statusOpts(["active", "inactive", "maintenance"]) },
    ] as Field[],
    compartment: [
      { k: "vehicle_id", fr: "Citerne / camion", en: "Tanker / truck", type: "select", options: opts("vehicles", "registration", (v) => v.kind !== "tractor") },
      { k: "position", fr: "N° compartiment", en: "Compartment #", type: "number" },
      { k: "capacity_litres", fr: "Capacité (L)", en: "Capacity (L)", type: "number" },
      { k: "calibration_ref", fr: "Réf. barème", en: "Calibration ref." },
    ] as Field[],
    driver: [
      { k: "full_name", fr: "Nom complet", en: "Full name" }, { k: "license_number", fr: "N° permis", en: "License #" },
      { k: "phone", fr: "Téléphone", en: "Phone" },
      { k: "carrier_id", fr: "Transporteur", en: "Carrier", type: "select", options: opts("carriers", "name") },
      { k: "status", fr: "Statut", en: "Status", type: "select", options: statusOpts(["active", "inactive", "suspended"]) },
    ] as Field[],
    document: [
      { k: "doc_type", fr: "Type de document", en: "Document type", type: "select", options: DOC_TYPES.map((v) => ({ v, l: v })) },
      { k: "vehicle_id", fr: "Véhicule (ou)", en: "Vehicle (or)", type: "select", options: opts("vehicles", "registration") },
      { k: "driver_id", fr: "Chauffeur", en: "Driver", type: "select", options: opts("drivers", "full_name") },
      { k: "doc_number", fr: "Numéro", en: "Number" },
      { k: "issued_on", fr: "Émis le", en: "Issued on", type: "date" }, { k: "expires_on", fr: "Expire le", en: "Expires on", type: "date" },
    ] as Field[],
    seal: [
      { k: "serial", fr: "N° de série", en: "Serial #" },
      { k: "status", fr: "Statut", en: "Status", type: "select", options: statusOpts(["available", "void"]) },
    ] as Field[],
  };

  const alerts = d.alerts ?? [];
  const trips = d.trips ?? [];
  const kpis = useMemo(() => ({
    active: trips.filter((t) => !["delivered"].includes(t.status)).length,
    transit: trips.filter((t) => t.status === "in_transit").length,
    incident: trips.filter((t) => t.status === "incident").length,
    alerts: alerts.length,
  }), [trips, alerts]);

  const simpleTable = (list: string, cols: [string, string, (r: Row) => React.ReactNode][], form: Field[], title: string) => (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title} ({(d[list] ?? []).length})</CardTitle>
        {canWrite && <Button size="sm" onClick={() => openForm(`logistics_${list}`, title, form)}><Plus className="h-4 w-4 mr-1" />{L("Ajouter", "Add")}</Button>}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{cols.map((c) => <TableHead key={c[0]}>{L(c[0], c[1])}</TableHead>)}{canWrite && <TableHead />}</TableRow></TableHeader>
          <TableBody>
            {(d[list] ?? []).length === 0 && <TableRow><TableCell colSpan={cols.length + 1} className="text-center text-muted-foreground">{L("Aucun élément", "No items")}</TableCell></TableRow>}
            {(d[list] ?? []).map((r) => (
              <TableRow key={r.id}>
                {cols.map((c) => <TableCell key={c[0]}>{c[2](r)}</TableCell>)}
                {canWrite && <TableCell><Button size="sm" variant="ghost" onClick={() => openForm(`logistics_${list}`, title, form, r)}>{L("Modifier", "Edit")}</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const today = new Date().toISOString().slice(0, 10);
  const docBadge = (exp?: string) => !exp ? <Badge variant="secondary">—</Badge>
    : exp < today ? <Badge variant="destructive">{L("Expiré", "Expired")}</Badge>
    : (new Date(exp).getTime() - Date.now()) / 864e5 <= 30 ? <Badge>{L("À échéance", "Due soon")}</Badge>
    : <Badge variant="outline">{L("Valide", "Valid")}</Badge>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[[L("Transports actifs", "Active trips"), kpis.active], [L("En transit", "In transit"), kpis.transit], [L("Incidents", "Incidents"), kpis.incident], [L("Alertes", "Alerts"), kpis.alerts]].map(([l, v]) => (
          <Card key={String(l)} className="glass-card"><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>
      {loading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      <Tabs defaultValue="trips">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="carriers">1. {L("Transporteurs", "Carriers")}</TabsTrigger>
          <TabsTrigger value="vehicles">2. {L("Camions, tracteurs & citernes", "Trucks, tractors & tankers")}</TabsTrigger>
          <TabsTrigger value="compartments">3. {L("Compartiments", "Compartments")}</TabsTrigger>
          <TabsTrigger value="drivers">4. {L("Chauffeurs", "Drivers")}</TabsTrigger>
          <TabsTrigger value="documents">5. {L("Documents", "Documents")}</TabsTrigger>
          <TabsTrigger value="seals">6. {L("Scellés", "Seals")}</TabsTrigger>
          <TabsTrigger value="supplies">7. {L("Demandes d'appro.", "Supply requests")}</TabsTrigger>
          <TabsTrigger value="trips">8. {L("Chargements & transports", "Loadings & trips")}</TabsTrigger>
          <TabsTrigger value="map"><MapPin className="h-4 w-4 mr-1" />9. {L("Carte & GPS", "Map & GPS")}</TabsTrigger>
          <TabsTrigger value="alerts">10. {L("Alertes", "Alerts")} {alerts.length > 0 && <Badge variant="destructive" className="ml-1">{alerts.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="trips">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{L("Transports liés aux chargements / livraisons", "Trips linked to loadings / deliveries")}</CardTitle>
              {canWrite && <Button size="sm" onClick={() => { setActionData({}); setAction({ trip: {}, action: "create", title: L("Planifier un transport", "Plan a trip") }); }}><Plus className="h-4 w-4 mr-1" />{L("Planifier", "Plan")}</Button>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{L("Référence", "Reference")}</TableHead><TableHead>{L("Appro.", "Supply")}</TableHead>
                  <TableHead>{L("Véhicule", "Vehicle")}</TableHead><TableHead>{L("Chauffeur", "Driver")}</TableHead>
                  <TableHead>ETA</TableHead><TableHead>{L("Chargement", "Load")}</TableHead><TableHead>{L("Chargé", "Loaded")}</TableHead><TableHead>{L("Livré", "Delivered")}</TableHead>
                  <TableHead>{L("Statut", "Status")}</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {trips.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">{L("Aucun transport", "No trips")}</TableCell></TableRow>}
                  {trips.map((t) => {
                    const n = NEXT[t.status];
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                        <TableCell className="text-xs">{t.supply_request_id ? (d.supplies ?? []).find((s) => s.id === t.supply_request_id)?.reference ?? "✓" : "—"}</TableCell>
                        <TableCell>{name("vehicles", t.truck_id, "registration")}{t.tanker_id && ` + ${name("vehicles", t.tanker_id, "registration")}`}</TableCell>
                        <TableCell>{name("drivers", t.driver_id, "full_name")}</TableCell>
                        <TableCell className="text-xs">{fmtDt(t.eta)}</TableCell>
                        <TableCell className="text-xs">{(() => { const ls = (d.loads ?? []).filter((x) => x.trip_id === t.id); if (!ls.length) return <Badge variant="destructive">{L("À planifier", "To plan")}</Badge>;
                          const dest = new Set(ls.map((x) => x.station_id ?? x.client_id)).size;
                          return <>{t.load_mode === "mixed" ? L("Mixte", "Mixed") : L("Mono", "Single")} · {[...new Set(ls.map((x) => name("products", x.product_id)))].join(" + ")} · {dest} {L("dest.", "dest.")}</>; })()}</TableCell>
                        <TableCell>{fmt(t.qty_loaded)}</TableCell><TableCell>{fmt(t.qty_delivered)}</TableCell>
                        <TableCell><Badge variant={t.status === "incident" ? "destructive" : t.status === "delivered" ? "outline" : "default"}>{L(...TRIP_STATUS[t.status])}</Badge></TableCell>
                        <TableCell className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(t)}><Eye className="h-4 w-4" /></Button>
                          {canWrite && ["planned", "loading"].includes(t.status) && <Button size="sm" variant="outline" title={L("Plan de chargement", "Loading plan")} onClick={() => setPlanTrip(t)}><Package className="h-4 w-4" /></Button>}
                          {canWrite && n && <Button size="sm" onClick={() => { setActionData({}); setAction({ trip: t, action: n[0], title: L(n[1], n[2]) }); }}>{L(n[1], n[2])}</Button>}
                          {canWrite && t.status === "incident" && <Button size="sm" variant="outline" onClick={() => { setActionData({ status: "in_transit" }); setAction({ trip: t, action: "resume", title: L("Reprendre", "Resume") }); }}>{L("Reprendre", "Resume")}</Button>}
                          {canWrite && !["delivered", "incident"].includes(t.status) && <Button size="sm" variant="destructive" onClick={() => { setActionData({}); setAction({ trip: t, action: "incident", title: L("Déclarer un incident", "Report incident") }); }}><AlertTriangle className="h-4 w-4" /></Button>}
                          {canWrite && t.status !== "delivered" && <Button size="sm" variant="outline" title={L("Position GPS manuelle", "Manual GPS position")} onClick={() => { setActionData({}); setAction({ trip: t, action: "position", title: L("Enregistrer une position", "Record position") }); }}><MapPin className="h-4 w-4" /></Button>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="supplies"><SupplyWorkflowModule /></TabsContent>

        <TabsContent value="map">
          <LogisticsMap trips={trips} vehicles={d.vehicles ?? []} drivers={d.drivers ?? []} L={L} scopeQuery={scopeQuery} />
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">{L("Alertes logistiques", "Logistics alerts")}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{L("Type", "Type")}</TableHead><TableHead>{L("Sévérité", "Severity")}</TableHead><TableHead>{L("Objet", "Subject")}</TableHead><TableHead>{L("Valeur / règle", "Value / rule")}</TableHead><TableHead>{L("Échéance", "Due")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {alerts.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{L("Aucune alerte", "No alerts")}</TableCell></TableRow>}
                  {alerts.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>{L(...ALERT[a.kind])}</TableCell>
                      <TableCell><Badge variant={a.severity === "critical" ? "destructive" : "default"}>{a.severity === "critical" ? L("Critique", "Critical") : L("Surveillance", "Warning")}</Badge></TableCell>
                      <TableCell>{a.label}</TableCell>
                      <TableCell className="text-xs">
                        {a.kind === "document_expired" && L(`${a.value} j avant échéance (alerte à 30 j)`, `${a.value} d to expiry (alert at 30 d)`)}
                        {a.kind === "delivery_late" && L(`${a.value} h après l'ETA (critique > 6 h)`, `${a.value} h past ETA (critical > 6 h)`)}
                        {a.kind === "quantity_variance" && L(`${fmt(a.value)} L hors tolérance`, `${fmt(a.value)} L beyond tolerance`)}
                        {a.kind === "seal_broken" && L("Scellé déclaré rompu au déchargement", "Seal reported broken at unloading")}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDt(a.due_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carriers">{simpleTable("carriers", [["Nom", "Name", (r) => r.name], ["Code", "Code", (r) => r.code ?? "—"], ["Téléphone", "Phone", (r) => r.phone ?? "—"], ["Statut", "Status", (r) => <Badge variant="outline">{r.status}</Badge>]], F.carrier, L("Transporteurs", "Carriers"))}</TabsContent>
        <TabsContent value="vehicles">{simpleTable("vehicles", [["Immatriculation", "Registration", (r) => r.registration], ["Type", "Type", (r) => L(...KIND[r.kind])], ["Transporteur", "Carrier", (r) => name("carriers", r.carrier_id)], ["Capacité", "Capacity", (r) => fmt(r.capacity_litres)], ["GPS", "GPS", (r) => r.gps_device_id ?? "—"], ["Statut", "Status", (r) => <Badge variant="outline">{r.status}</Badge>]], F.vehicle, L("Véhicules", "Vehicles"))}</TabsContent>
        <TabsContent value="compartments">{simpleTable("compartments", [["Véhicule", "Vehicle", (r) => name("vehicles", r.vehicle_id, "registration")], ["N°", "#", (r) => r.position], ["Capacité (L)", "Capacity (L)", (r) => fmt(r.capacity_litres)], ["Barème", "Calibration", (r) => r.calibration_ref ?? "—"]], F.compartment, L("Compartiments", "Compartments"))}</TabsContent>
        <TabsContent value="drivers">{simpleTable("drivers", [["Nom", "Name", (r) => r.full_name], ["Permis", "License", (r) => r.license_number ?? "—"], ["Téléphone", "Phone", (r) => r.phone ?? "—"], ["Transporteur", "Carrier", (r) => name("carriers", r.carrier_id)], ["Statut", "Status", (r) => <Badge variant="outline">{r.status}</Badge>]], F.driver, L("Chauffeurs", "Drivers"))}</TabsContent>
        <TabsContent value="documents">{simpleTable("documents", [["Type", "Type", (r) => r.doc_type], ["Rattaché à", "Linked to", (r) => r.vehicle_id ? name("vehicles", r.vehicle_id, "registration") : name("drivers", r.driver_id, "full_name")], ["Numéro", "Number", (r) => r.doc_number ?? "—"], ["Expire le", "Expires", (r) => r.expires_on ?? "—"], ["État", "State", (r) => docBadge(r.expires_on)]], F.document, L("Documents véhicule / chauffeur", "Vehicle / driver documents"))}</TabsContent>
        <TabsContent value="seals">{simpleTable("seals", [["N° de série", "Serial", (r) => r.serial], ["Statut", "Status", (r) => <Badge variant={["broken", "anomaly"].includes(r.status) ? "destructive" : "outline"}>{r.status}</Badge>], ["Transport", "Trip", (r) => name("trips", r.trip_id, "reference")]], F.seal, L("Scellés", "Seals"))}</TabsContent>
      </Tabs>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dialog?.title}</DialogTitle></DialogHeader>
          <div className="grid gap-3 max-h-[60vh] overflow-y-auto">
            {dialog?.fields.map((f) => (
              <div key={f.k} className="grid gap-1">
                <Label>{L(f.fr, f.en)}</Label>
                {f.type === "select" ? (
                  <Select value={dialog.values[f.k] ?? ""} onValueChange={(v) => setDialog({ ...dialog, values: { ...dialog.values, [f.k]: v } })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{f.options?.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={dialog.values[f.k] ?? ""}
                    onChange={(e) => setDialog({ ...dialog, values: { ...dialog.values, [f.k]: e.target.value } })} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter><Button onClick={saveForm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{L("Enregistrer", "Save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{action?.title} {action?.trip?.reference}</DialogTitle></DialogHeader>
          {action && (() => {
            const set = (k: string, v: unknown) => setActionData({ ...actionData, [k]: v });
            const sel = (k: string, label: string, o: { v: string; l: string }[]) => (
              <div className="grid gap-1"><Label>{label}</Label>
                <Select value={actionData[k] ?? ""} onValueChange={(v) => set(k, v)}><SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{o.map((x) => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent></Select></div>);
            const inp = (k: string, label: string, type = "text") => (
              <div className="grid gap-1"><Label>{label}</Label><Input type={type} value={actionData[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></div>);
            const a = action.action;
            return (
              <div className="grid gap-3 max-h-[60vh] overflow-y-auto">
                {a === "create" && <>
                  {sel("supply_request_id", L("Approvisionnement lié", "Linked supply"), opts("supplies", "reference"))}
                  {sel("carrier_id", L("Transporteur", "Carrier"), opts("carriers", "name", (x) => x.status === "active"))}
                  {sel("truck_id", L("Camion / tracteur", "Truck / tractor"), opts("vehicles", "registration", (x) => x.kind !== "tanker" && x.status === "active"))}
                  {sel("tanker_id", L("Citerne (si tracteur)", "Tanker (if tractor)"), opts("vehicles", "registration", (x) => x.kind === "tanker" && x.status === "active"))}
                  {sel("driver_id", L("Chauffeur", "Driver"), opts("drivers", "full_name", (x) => x.status === "active"))}
                  {inp("planned_departure", L("Départ prévu", "Planned departure"), "datetime-local")}
                  {inp("eta", L("Arrivée estimée (ETA)", "ETA"), "datetime-local")}
                  {inp("tolerance_pct", L("Tolérance d'écart (%) — défaut 0,5", "Variance tolerance (%) — default 0.5"), "number")}
                  <p className="text-xs text-muted-foreground">{L("Un véhicule ou chauffeur avec un document expiré est refusé.", "Vehicles or drivers with expired documents are refused.")}</p>
                </>}
                {a === "finish_loading" && <>
                  <p className="text-sm">{L("Quantité chargée = plan de chargement", "Loaded quantity = loading plan")} : <b>{fmt((d.loads ?? []).filter((x) => x.trip_id === action.trip.id).reduce((s2, x) => s2 + Number(x.qty_litres), 0))} L</b></p>
                  <Label>{L("Scellés posés", "Seals applied")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(d.seals ?? []).filter((s) => s.status === "available").map((s) => {
                      const on = (actionData.seal_ids ?? []).includes(s.id);
                      return <Badge key={s.id} variant={on ? "default" : "outline"} className="cursor-pointer" onClick={() => set("seal_ids", on ? actionData.seal_ids.filter((x: string) => x !== s.id) : [...(actionData.seal_ids ?? []), s.id])}>{s.serial}</Badge>;
                    })}
                  </div>
                </>}
                {a === "depart" && inp("eta", L("ETA (optionnel)", "ETA (optional)"), "datetime-local")}
                {a === "start_unloading" && sel("seals_intact", L("Scellés intacts ?", "Seals intact?"), [{ v: "true", l: L("Oui", "Yes") }, { v: "false", l: L("Non — rompus", "No — broken") }])}
                {a === "deliver" && inp("qty_delivered", L("Quantité livrée (L)", "Delivered quantity (L)"), "number")}
                {a === "resume" && sel("status", L("Reprendre au statut", "Resume at status"), ["planned", "loading", "loaded", "in_transit", "arrived", "unloading"].map((v) => ({ v, l: L(...TRIP_STATUS[v]) })))}
                {a === "position" && <>{inp("latitude", "Latitude", "number")}{inp("longitude", "Longitude", "number")}{inp("speed_kmh", L("Vitesse (km/h)", "Speed (km/h)"), "number")}</>}
                {["incident", "resume"].includes(a) && <div className="grid gap-1"><Label>{L("Description / motif", "Description / reason")}</Label><Textarea value={actionData._reason ?? ""} onChange={(e) => set("_reason", e.target.value)} /></div>}
              </div>
            );
          })()}
          <DialogFooter>
            <Button disabled={busy} onClick={async () => {
              if (!action) return;
              const { _reason, ...rest } = actionData;
              if (action.action === "create") { rest.tenant_id = tenantId; rest.country_id = countryId; }
              if (action.action === "finish_loading") rest.qty_loaded = (d.loads ?? []).filter((x) => x.trip_id === action.trip.id).reduce((s2, x) => s2 + Number(x.qty_litres), 0);
              if (rest.seals_intact) rest.seals_intact = rest.seals_intact === "true";
              ["planned_departure", "eta"].forEach((k) => { if (rest[k]) rest[k] = new Date(rest[k]).toISOString(); });
              if (await runAction(action.action === "create" ? null : action.trip.id, action.action, _reason, rest)) setAction(null);
            }}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}{L("Confirmer", "Confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoadPlanDialog trip={planTrip} onClose={() => setPlanTrip(null)} onSaved={load} L={L}
        vehicles={d.vehicles ?? []} compartments={d.compartments ?? []} products={d.products ?? []} stations={d.stations ?? []} clients={d.clients ?? []} loads={d.loads ?? []} />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.reference}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>{L("Statut", "Status")} : <b>{L(...TRIP_STATUS[detail.status])}</b></div>
                <div>{L("Transporteur", "Carrier")} : {name("carriers", detail.carrier_id)}</div>
                <div>{L("Chargé", "Loaded")} : {fmt(detail.qty_loaded)} L</div>
                <div>{L("Livré", "Delivered")} : {fmt(detail.qty_delivered)} L</div>
                <div>{L("Écart", "Variance")} : {detail.qty_loaded && detail.qty_delivered ? `${fmt(detail.qty_delivered - detail.qty_loaded)} L (${L("tolérance", "tolerance")} ${detail.tolerance_pct} %)` : "—"}</div>
                <div>{L("Dernière position", "Last position")} : {detail.last_position ? `${detail.last_position.latitude}, ${detail.last_position.longitude}` : L("aucune (GPS non connecté)", "none (GPS not connected)")}</div>
                {detail.incident_note && <div className="col-span-2 text-destructive">{detail.incident_note}</div>}
              </div>
              <div className="font-semibold">{L("Historique", "History")}</div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {events.map((e) => (
                  <div key={e.id} className="border-l-2 border-primary pl-2 text-xs">
                    <b>{fmtDt(e.created_at)}</b> — {e.action} {e.to_status && `→ ${L(...(TRIP_STATUS[e.to_status] ?? [e.to_status, e.to_status]))}`} · {e.author_name ?? ""}{e.reason && ` · ${e.reason}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
