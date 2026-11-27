import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileX, Plus, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DRIVER_REQUIRED_DOCS, VEHICLE_REQUIRED_DOCS, docState, entityCompliance, documentReportRows, filterDocumentReport, type DocState, type DocumentGroup } from "@/lib/docCompliance";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useLanguage } from "@/hooks/useLanguage";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Props = { d: Record<string, Row[]>; L: (fr: string, en: string) => string; canWrite: boolean; onAdd: (prefill?: Row) => void; onEdit: (row: Row) => void };
type Filter = "all" | DocState;

export function DocumentsComplianceTab({ d, L, canWrite, onAdd, onEdit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<DocumentGroup>("all");
  const [exporting, setExporting] = useState(false);
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { language } = useLanguage();
  const canExport = isPlatformAdmin || can("supplies", "export");
  const docs = d.documents ?? [];
  const label: Record<DocState, string> = { expired: L("Expiré", "Expired"), urgent: L("Urgent ≤ 15 j", "Urgent ≤ 15 d"), due_soon: L("Échéance 16–30 j", "Due in 16–30 d"), valid: L("Valide > 30 j", "Valid > 30 d"), missing: L("Manquant", "Missing") };
  const tones: Record<DocState, string> = { expired: "border-destructive/30 bg-destructive/10 text-destructive", urgent: "border-destructive/30 bg-destructive/10 text-destructive", due_soon: "border-warning/30 bg-warning/10 text-warning", valid: "border-success/30 bg-success/10 text-success", missing: "border-border text-muted-foreground" };
  const badge = (s: DocState, extra?: string) => (
    <Badge variant="outline" className={tones[s]}>{label[s]}{extra ? ` · ${extra}` : ""}</Badge>
  );
  const days = (n?: number) => (n === undefined ? "" : n < 0 ? L(`${-n} j de retard`, `${-n} d overdue`) : L(`${n} j`, `${n} d`));

  const vehicles = (d.vehicles ?? []).filter((v) => v.status !== "inactive").map((v) => ({ v, ...entityCompliance(docs, "vehicle_id", v.id, VEHICLE_REQUIRED_DOCS, today) }));
  const drivers = (d.drivers ?? []).filter((x) => x.status !== "inactive").map((x) => ({ x, ...entityCompliance(docs, "driver_id", x.id, DRIVER_REQUIRED_DOCS, today) }));
  const report = useMemo(() => documentReportRows(docs, d.vehicles ?? [], d.drivers ?? [], today), [docs, d.vehicles, d.drivers, today]);
  const exportRows = filterDocumentReport(report, group, filter, q);
  const counts = { expired: 0, urgent: 0, due_soon: 0, valid: 0, missing: 0 };
  filterDocumentReport(report, group, "all", "").forEach((row) => { counts[row.state]++; });
  const doExport = async (format: "xlsx" | "pdf") => {
    if (!canExport || exporting || !exportRows.length) return;
    setExporting(true);
    try {
      const { exportDocumentCompliance } = await import("@/lib/docComplianceExport");
      await exportDocumentCompliance(exportRows, group, today, format, language === "en" ? "en" : "fr");
    } catch {
      toast.error(L("L’export a échoué. Réessayez.", "Export failed. Please retry."));
    } finally { setExporting(false); }
  };

  const match = (text: string, worst: DocState) => (filter === "all" || worst === filter) && text.toLowerCase().includes(q.toLowerCase());
  const nm = (list: string, id: string, key: string) => (d[list] ?? []).find((r) => r.id === id)?.[key] ?? "—";
  const listed = docs
    .map((r) => ({ r, s: docState(r.expires_on, today), who: r.vehicle_id ? nm("vehicles", r.vehicle_id, "registration") : nm("drivers", r.driver_id, "full_name") }))
    .filter(({ r }) => group === "all" || (group === "vehicles" ? !!r.vehicle_id : !!r.driver_id))
    .filter((x) => match(`${x.who} ${x.r.doc_type} ${x.r.doc_number ?? ""}`, x.s))
    .sort((a, b) => String(a.r.expires_on ?? "9").localeCompare(String(b.r.expires_on ?? "9")));

  const kpi = (f: Filter, icon: React.ReactNode, title: string, n: number, tone: string) => (
    <Button variant="outline" onClick={() => setFilter(filter === f ? "all" : f)} className={`h-auto min-w-0 flex-col items-start whitespace-normal text-left rounded-lg border p-3 transition ${filter === f ? "border-primary bg-primary/10" : "border-border"}`}>
      <div className={`flex items-center gap-2 text-sm ${tone}`}>{icon}{title}</div>
      <div className="text-2xl font-semibold">{n}</div>
    </Button>
  );

  const matrix = (title: string, rows: { id: string; name: string; sub?: string; cells: ReturnType<typeof entityCompliance>["cells"]; worst: DocState; blocked: boolean; prefill: Row }[], required: string[]) => (
    <Card className="glass-card">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>{L("Nom", "Name")}</TableHead>{required.map((t) => <TableHead key={t}>{t}</TableHead>)}<TableHead>{L("Aptitude", "Fitness")}</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.filter((r) => match(r.name, r.worst)).map((r) => (
              <TableRow key={r.id}>
                <TableCell><div className="font-medium">{r.name}</div>{r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}</TableCell>
                {r.cells.map((c) => (
                  <TableCell key={c.type}>
                    {c.state === "missing" && canWrite
                      ? <Button size="sm" variant="outline" onClick={() => onAdd({ ...r.prefill, doc_type: c.type })}><Plus className="h-3 w-3 mr-1" />{L("Ajouter", "Add")}</Button>
                      : <div className="space-y-0.5">{badge(c.state)}<div className="text-xs text-muted-foreground">{c.expires_on ?? ""} {days(c.days)}</div></div>}
                  </TableCell>
                ))}
                <TableCell>{r.blocked ? <Badge variant="destructive">{L("Bloqué", "Blocked")}</Badge> : <Badge variant="outline">{L("Apte", "Fit")}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpi("expired", <FileX className="h-4 w-4" />, L("Expirés", "Expired"), counts.expired, "text-destructive")}
        {kpi("urgent", <AlertTriangle className="h-4 w-4 shrink-0" />, L("Urgents ≤ 15 j", "Urgent ≤ 15 d"), counts.urgent, "text-destructive")}
        {kpi("due_soon", <Clock className="h-4 w-4 shrink-0" />, L("Échéance 16–30 j", "Due in 16–30 d"), counts.due_soon, "text-warning")}
        {kpi("missing", <AlertTriangle className="h-4 w-4" />, L("Pièces manquantes", "Missing"), counts.missing, "text-destructive")}
        {kpi("valid", <CheckCircle2 className="h-4 w-4" />, L("Valides > 30 j", "Valid > 30 d"), counts.valid, "text-success")}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="max-w-xs" placeholder={L("Rechercher camion, chauffeur, n°…", "Search truck, driver, number…")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={group} onValueChange={(value) => { if (value === "all" || value === "vehicles" || value === "drivers") setGroup(value); }}>
          <SelectTrigger className="w-52" aria-label={L("Catégorie de documents", "Document category")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{L("Camions & chauffeurs", "Trucks & drivers")}</SelectItem><SelectItem value="vehicles">{L("Camions & citernes", "Trucks & tankers")}</SelectItem><SelectItem value="drivers">{L("Chauffeurs", "Drivers")}</SelectItem></SelectContent>
        </Select>
        {canExport && <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" disabled={exporting || !exportRows.length}>{exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}{L("Exporter", "Export")}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void doExport("pdf")}><FileText className="h-4 w-4 mr-2" />PDF</DropdownMenuItem><DropdownMenuItem onSelect={() => void doExport("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel (.xlsx)</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>}
        {filter !== "all" && <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>{L("Tout afficher", "Show all")}</Button>}
        {canWrite && <Button size="sm" className="ml-auto" onClick={() => onAdd()}><Plus className="h-4 w-4 mr-1" />{L("Ajouter un document", "Add document")}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{L("Un camion avec un document expiré est refusé au chargement ; les documents des chauffeurs sont suivis sans bloquer.", "Trucks with an expired document are refused for loading; driver documents are tracked without blocking.")}</p>
      {group !== "drivers" && matrix(L("Camions & citernes", "Trucks & tankers"), vehicles.map((e) => ({ id: e.v.id, name: e.v.registration, sub: e.v.kind, cells: e.cells, worst: e.worst, blocked: e.blocked, prefill: { vehicle_id: e.v.id, driver_id: e.v.default_driver_id } })), VEHICLE_REQUIRED_DOCS)}
      {group !== "vehicles" && matrix(L("Chauffeurs", "Drivers"), drivers.map((e) => ({ id: e.x.id, name: e.x.full_name, sub: e.x.license_number, cells: e.cells, worst: e.worst, blocked: e.blocked, prefill: { driver_id: e.x.id } })), DRIVER_REQUIRED_DOCS)}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">{L("Tous les documents par échéance", "All documents by due date")} ({listed.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>{L("Rattaché à", "Linked to")}</TableHead><TableHead>{L("Numéro", "Number")}</TableHead><TableHead>{L("Expire le", "Expires")}</TableHead><TableHead>{L("État", "State")}</TableHead>{canWrite && <TableHead />}</TableRow></TableHeader>
            <TableBody>
              {listed.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{L("Aucun document", "No documents")}</TableCell></TableRow>}
              {listed.map(({ r, s, who }) => (
                <TableRow key={r.id}>
                  <TableCell>{r.doc_type}</TableCell><TableCell>{who}</TableCell><TableCell>{r.doc_number ?? "—"}</TableCell>
                  <TableCell>{r.expires_on ?? "—"}</TableCell><TableCell>{badge(s, r.expires_on ? days(Math.round((Date.parse(r.expires_on) - Date.parse(today)) / 864e5)) : undefined)}</TableCell>
                  {canWrite && <TableCell><Button size="sm" variant="ghost" onClick={() => onEdit(r)}>{L("Modifier", "Edit")}</Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
