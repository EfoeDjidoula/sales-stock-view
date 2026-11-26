import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileX, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DRIVER_REQUIRED_DOCS, VEHICLE_REQUIRED_DOCS, docState, entityCompliance, type DocState } from "@/lib/docCompliance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Props = { d: Record<string, Row[]>; L: (fr: string, en: string) => string; canWrite: boolean; onAdd: (prefill?: Row) => void; onEdit: (row: Row) => void };
type Filter = "all" | DocState;

export function DocumentsComplianceTab({ d, L, canWrite, onAdd, onEdit }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const docs = d.documents ?? [];
  const label: Record<DocState, string> = { expired: L("Expiré", "Expired"), due_soon: L("À échéance", "Due soon"), valid: L("Valide", "Valid"), missing: L("Manquant", "Missing") };
  const badge = (s: DocState, extra?: string) => (
    <Badge variant={s === "expired" || s === "missing" ? "destructive" : s === "valid" ? "outline" : "default"}>{label[s]}{extra ? ` · ${extra}` : ""}</Badge>
  );
  const days = (n?: number) => (n === undefined ? "" : n < 0 ? L(`${-n} j de retard`, `${-n} d overdue`) : L(`${n} j`, `${n} d`));

  const vehicles = (d.vehicles ?? []).filter((v) => v.status !== "inactive").map((v) => ({ v, ...entityCompliance(docs, "vehicle_id", v.id, VEHICLE_REQUIRED_DOCS, today) }));
  const drivers = (d.drivers ?? []).filter((x) => x.status !== "inactive").map((x) => ({ x, ...entityCompliance(docs, "driver_id", x.id, DRIVER_REQUIRED_DOCS, today) }));
  const counts = useMemo(() => {
    const c = { expired: 0, due_soon: 0, valid: 0, missing: 0 };
    docs.forEach((r) => { c[docState(r.expires_on, today)]++; });
    [...vehicles, ...drivers].forEach((e) => e.cells.forEach((cell) => { if (cell.state === "missing") c.missing++; }));
    return c;
  }, [docs, vehicles, drivers, today]);

  const match = (text: string, worst: DocState) => (filter === "all" || worst === filter) && text.toLowerCase().includes(q.toLowerCase());
  const nm = (list: string, id: string, key: string) => (d[list] ?? []).find((r) => r.id === id)?.[key] ?? "—";
  const listed = docs
    .map((r) => ({ r, s: docState(r.expires_on, today), who: r.vehicle_id ? nm("vehicles", r.vehicle_id, "registration") : nm("drivers", r.driver_id, "full_name") }))
    .filter((x) => match(`${x.who} ${x.r.doc_type} ${x.r.doc_number ?? ""}`, x.s))
    .sort((a, b) => String(a.r.expires_on ?? "9").localeCompare(String(b.r.expires_on ?? "9")));

  const kpi = (f: Filter, icon: React.ReactNode, title: string, n: number, tone: string) => (
    <button onClick={() => setFilter(filter === f ? "all" : f)} className={`text-left rounded-lg border p-3 transition ${filter === f ? "border-primary bg-primary/10" : "border-border"}`}>
      <div className={`flex items-center gap-2 text-sm ${tone}`}>{icon}{title}</div>
      <div className="text-2xl font-semibold">{n}</div>
    </button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpi("expired", <FileX className="h-4 w-4" />, L("Expirés", "Expired"), counts.expired, "text-destructive")}
        {kpi("due_soon", <Clock className="h-4 w-4" />, L("Échéance ≤ 30 j", "Due ≤ 30 d"), counts.due_soon, "text-primary")}
        {kpi("missing", <AlertTriangle className="h-4 w-4" />, L("Pièces manquantes", "Missing"), counts.missing, "text-destructive")}
        {kpi("valid", <CheckCircle2 className="h-4 w-4" />, L("Valides", "Valid"), counts.valid, "text-muted-foreground")}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="max-w-xs" placeholder={L("Rechercher camion, chauffeur, n°…", "Search truck, driver, number…")} value={q} onChange={(e) => setQ(e.target.value)} />
        {filter !== "all" && <Button size="sm" variant="ghost" onClick={() => setFilter("all")}>{L("Tout afficher", "Show all")}</Button>}
        {canWrite && <Button size="sm" className="ml-auto" onClick={() => onAdd()}><Plus className="h-4 w-4 mr-1" />{L("Ajouter un document", "Add document")}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{L("Un camion ou chauffeur avec un document expiré est refusé au chargement.", "Trucks or drivers with an expired document are refused for loading.")}</p>
      {matrix(L("Camions & citernes", "Trucks & tankers"), vehicles.map((e) => ({ id: e.v.id, name: e.v.registration, sub: e.v.kind, cells: e.cells, worst: e.worst, blocked: e.blocked, prefill: { vehicle_id: e.v.id, driver_id: e.v.default_driver_id } })), VEHICLE_REQUIRED_DOCS)}
      {matrix(L("Chauffeurs", "Drivers"), drivers.map((e) => ({ id: e.x.id, name: e.x.full_name, sub: e.x.license_number, cells: e.cells, worst: e.worst, blocked: e.blocked, prefill: { driver_id: e.x.id } })), DRIVER_REQUIRED_DOCS)}
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
