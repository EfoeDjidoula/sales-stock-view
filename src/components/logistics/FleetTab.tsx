import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VEHICLE_KINDS, TOWED_KINDS, isTowed, carriesLoad, resizeCompartments, compartmentErrors, type CompRow } from "@/lib/fleet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fmt = (n: unknown) => (n === null || n === undefined || n === "" ? "—" : Math.round(Number(n)).toLocaleString("fr-FR"));
const NONE = "__none";

type Props = { d: Record<string, Row[]>; canWrite: boolean; L: (fr: string, en: string) => string; tenantId: string | null; countryId: string | null; onSaved: () => void };

export const FleetTab = ({ d, canWrite, L, tenantId, countryId, onSaved }: Props) => {
  const vehicles = d.vehicles ?? [];
  const comps = d.compartments ?? [];
  const drivers = d.drivers ?? [];
  const carriers = d.carriers ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<Row | null>(null);
  const [rows, setRows] = useState<CompRow[]>([]);
  const [busy, setBusy] = useState(false);

  const byId = (id?: string) => vehicles.find((v) => v.id === id);
  const compsOf = (id?: string) => comps.filter((c) => c.vehicle_id === id).sort((a, b) => a.position - b.position);
  const linkedTrailers = new Set(vehicles.map((v) => v.default_trailer_id).filter(Boolean));
  const list = vehicles.filter((v) => !(isTowed(v.kind) && linkedTrailers.has(v.id)));
  const kindLabel = (k: string) => (VEHICLE_KINDS[k] ? L(...VEHICLE_KINDS[k]) : k);

  const startNew = () => { setForm({ kind: "truck", status: "active", trailer_kind: "semi_trailer", comp_count: "" }); setRows([]); };
  const startEdit = (v: Row) => {
    const tr = v.kind === "tractor" ? byId(v.default_trailer_id) : undefined;
    const loadUnit = tr ?? v;
    const cs = compsOf(loadUnit.id).map((c) => ({ id: c.id, position: c.position, capacity_litres: Number(c.capacity_litres), calibration_ref: c.calibration_ref ?? "" }));
    setForm({ ...v, trailer_id: tr?.id, trailer_kind: tr?.kind ?? "semi_trailer", trailer_registration: tr?.registration ?? "",
      capacity_litres: loadUnit.capacity_litres ?? "", comp_count: cs.length || "", orig_kind: v.kind, orig_count: cs.length });
    setRows(cs);
  };
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f!, [k]: v }));
  const mapComps = (id?: string) => compsOf(id).map((c) => ({ id: c.id, position: c.position, capacity_litres: Number(c.capacity_litres), calibration_ref: c.calibration_ref ?? "" }));
  /** Change type, also on edit: a combined "AA/BB" registration is split into tractor + tank. */
  const changeKind = (k: string) => setForm((f) => {
    const n: Row = { ...f!, kind: k };
    if (k === "tractor" && f!.kind !== "tractor" && f!.id) {
      const [a, b] = String(f!.registration ?? "").split("/").map((x) => x.trim());
      if (b) { const suf = /\d$/.test(a) ? (b.match(/[A-Z]+$/i)?.[0] ?? "") : ""; n.registration = a + suf; n.trailer_registration = b; }
      n.trailer_id = undefined; // new tank unit, existing compartments move onto it
    }
    if (k !== "tractor" && f!.kind === "tractor" && f!.id) { n.trailer_id = undefined; setRows(mapComps(f!.id)); n.comp_count = compsOf(f!.id).length || ""; }
    return n;
  });
  const linkedElsewhere = (id: string) => vehicles.some((v) => v.default_trailer_id === id && v.id !== form?.id);
  const freeTrailers = vehicles.filter((v) => isTowed(v.kind) && v.id !== form?.id && !linkedElsewhere(v.id));
  const pickTrailer = (id: string) => {
    if (id === NONE) { setForm((f) => ({ ...f!, trailer_id: undefined })); return; }
    const t = byId(id)!; const cs = mapComps(id);
    setForm((f) => ({ ...f!, trailer_id: id, trailer_kind: t.kind, trailer_registration: t.registration, capacity_litres: t.capacity_litres ?? "", comp_count: cs.length || "", orig_count: cs.length }));
    setRows(cs);
  };
  const setCount = (n: string) => { set("comp_count", n); setRows((r) => resizeCompartments(r, Number(n))); };

  const save = async () => {
    if (!form || !tenantId || !countryId) return;
    const tractor = form.kind === "tractor";
    const cap = Number(form.capacity_litres) || 0;
    if (!form.registration?.trim()) return toast.error(L("Immatriculation obligatoire", "Registration required"));
    if (tractor && !form.trailer_registration?.trim()) return toast.error(L("Immatriculation de la citerne / remorque obligatoire", "Trailer registration required"));
    const existing = Number(form.orig_count) || 0;
    if (rows.length < existing) return toast.error(L(`Ce véhicule a déjà ${existing} compartiments : on ne peut pas en retirer (traçabilité des chargements).`, `This vehicle already has ${existing} compartments and they cannot be removed.`));
    const errs = compartmentErrors(rows, cap);
    if (errs.length) return toast.error(errs.join(" "));
    setBusy(true);
    try {
      const scope = { tenant_id: tenantId, country_id: countryId };
      const base = { carrier_id: form.carrier_id || null, brand: form.brand || null, model: form.model || null, status: form.status || "active", gps_device_id: form.gps_device_id || null };
      const upsert = async (id: string | undefined, payload: Row) => {
        const r = id ? await db.from("logistics_vehicles").update(payload).eq("id", id).select("id").single()
          : await db.from("logistics_vehicles").insert({ ...payload, ...scope }).select("id").single();
        if (r.error) throw r.error; return r.data.id as string;
      };
      let loadUnitId: string;
      if (tractor) {
        loadUnitId = await upsert(form.trailer_id, { ...base, kind: form.trailer_kind, registration: form.trailer_registration.trim(), capacity_litres: cap || null });
        await upsert(form.id, { ...base, kind: "tractor", registration: form.registration.trim(), capacity_litres: null, default_trailer_id: loadUnitId, default_driver_id: form.default_driver_id || null });
      } else {
        loadUnitId = await upsert(form.id, { ...base, kind: form.kind, registration: form.registration.trim(), capacity_litres: cap || null, default_trailer_id: null,
          default_driver_id: isTowed(form.kind) ? null : form.default_driver_id || null });
      }
      for (const r of rows) {
        const p = { vehicle_id: loadUnitId, position: r.position, capacity_litres: Number(r.capacity_litres), calibration_ref: r.calibration_ref || null };
        const res = r.id ? await db.from("logistics_compartments").update(p).eq("id", r.id)
          : await db.from("logistics_compartments").insert({ ...p, ...scope, vehicle_id: loadUnitId });
        if (res.error) throw res.error;
      }
      toast.success(L("Véhicule enregistré", "Vehicle saved"));
      setForm(null); onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const tractor = form?.kind === "tractor";
  const total = rows.reduce((s, r) => s + (Number(r.capacity_litres) || 0), 0);

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{L("Flotte, citernes & compartiments", "Fleet, tankers & compartments")} ({list.length})</CardTitle>
        {canWrite && <Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" />{L("Nouveau véhicule", "New vehicle")}</Button>}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="text-xs text-muted-foreground mb-2">{L("Cliquez sur un véhicule pour voir ses compartiments et son chauffeur attitré.", "Click a vehicle to see its compartments and assigned driver.")}</p>
        <Table>
          <TableHeader><TableRow>
            <TableHead /><TableHead>{L("Immatriculation", "Registration")}</TableHead><TableHead>{L("Type", "Type")}</TableHead>
            <TableHead>{L("Chauffeur attitré", "Assigned driver")}</TableHead><TableHead className="text-right">{L("Capacité (L)", "Capacity (L)")}</TableHead>
            <TableHead>{L("Compart.", "Comp.")}</TableHead><TableHead>{L("Statut", "Status")}</TableHead>{canWrite && <TableHead />}
          </TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{L("Aucun véhicule", "No vehicle")}</TableCell></TableRow>}
            {list.map((v) => {
              const tr = v.kind === "tractor" ? byId(v.default_trailer_id) : undefined;
              const unit = tr ?? v;
              const cs = compsOf(unit.id);
              const isOpen = open === v.id;
              return (
                <Fragment key={v.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : v.id)}>
                    <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-medium">{v.registration}{tr && <span className="text-muted-foreground"> + {tr.registration}</span>}</TableCell>
                    <TableCell>{kindLabel(v.kind)}{tr && ` + ${kindLabel(tr.kind)}`}</TableCell>
                    <TableCell>{drivers.find((x) => x.id === v.default_driver_id)?.full_name ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(unit.capacity_litres)}</TableCell>
                    <TableCell>{cs.length || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{v.status}</Badge></TableCell>
                    {canWrite && <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); startEdit(v); }}>{L("Modifier", "Edit")}</Button></TableCell>}
                  </TableRow>
                  {isOpen && (
                    <TableRow><TableCell colSpan={8} className="bg-muted/30">
                      <div className="grid gap-3 md:grid-cols-3 text-sm">
                        <div><div className="text-xs text-muted-foreground">{L("Transporteur", "Carrier")}</div>{carriers.find((c) => c.id === v.carrier_id)?.name ?? "—"}</div>
                        <div><div className="text-xs text-muted-foreground">{L("Chauffeur", "Driver")}</div>{(() => { const dr = drivers.find((x) => x.id === v.default_driver_id); return dr ? `${dr.full_name}${dr.phone ? ` — ${dr.phone}` : ""}${dr.license_number ? ` — ${L("permis", "licence")} ${dr.license_number}` : ""}` : L("Non affecté", "Not assigned"); })()}</div>
                        <div><div className="text-xs text-muted-foreground">{L("Marque / modèle", "Brand / model")}</div>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cs.length === 0 && <span className="text-sm text-muted-foreground">{L("Aucun compartiment configuré", "No compartment configured")}</span>}
                        {cs.map((c) => (
                          <div key={c.id} className="rounded-md border border-border px-3 py-2 text-sm">
                            <div className="text-xs text-muted-foreground">{L("Compartiment", "Compartment")} {c.position}</div>
                            <div className="font-semibold">{fmt(c.capacity_litres)} L</div>
                            {c.calibration_ref && <div className="text-xs text-muted-foreground">{c.calibration_ref}</div>}
                          </div>
                        ))}
                      </div>
                    </TableCell></TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? L("Modifier le véhicule", "Edit vehicle") : L("Nouveau véhicule", "New vehicle")}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>{L("Type de véhicule", "Vehicle type")}</Label>
                  <Select value={form.kind} onValueChange={changeKind}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.keys(VEHICLE_KINDS).map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>{tractor ? L("Immatriculation du tracteur", "Tractor registration") : L("Immatriculation", "Registration")}</Label>
                  <Input value={form.registration ?? ""} onChange={(e) => set("registration", e.target.value)} /></div>
                {tractor && <>
                  {freeTrailers.length > 0 && <div className="sm:col-span-2"><Label>{L("Citerne attelée existante", "Existing towed tank")}</Label>
                    <Select value={form.trailer_id ?? NONE} onValueChange={pickTrailer}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value={NONE}>{L("— Nouvelle citerne —", "— New tank —")}</SelectItem>
                        {freeTrailers.concat(form.trailer_id && !freeTrailers.some((t) => t.id === form.trailer_id) ? [byId(form.trailer_id)!] : []).map((t) => <SelectItem key={t.id} value={t.id}>{t.registration} ({kindLabel(t.kind)})</SelectItem>)}</SelectContent></Select></div>}
                  <div><Label>{L("Type de citerne attelée", "Towed tank type")}</Label>
                    <Select value={form.trailer_kind} onValueChange={(v) => set("trailer_kind", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TOWED_KINDS.map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>{L("Immatriculation de la citerne / remorque", "Tank / trailer registration")}</Label>
                    <Input value={form.trailer_registration ?? ""} onChange={(e) => set("trailer_registration", e.target.value)} /></div>
                </>}
                <div><Label>{L("Transporteur", "Carrier")}</Label>
                  <Select value={form.carrier_id ?? NONE} onValueChange={(v) => set("carrier_id", v === NONE ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>—</SelectItem>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                {!isTowed(form.kind) && <div><Label>{L("Chauffeur attitré", "Assigned driver")}</Label>
                  <Select value={form.default_driver_id ?? NONE} onValueChange={(v) => set("default_driver_id", v === NONE ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={NONE}>—</SelectItem>{drivers.map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent></Select></div>}
                <div><Label>{L("Marque", "Brand")}</Label><Input value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value)} /></div>
                <div><Label>{L("Modèle", "Model")}</Label><Input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} /></div>
                <div><Label>{L("Statut", "Status")}</Label>
                  <Select value={form.status} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["active", "inactive", "maintenance"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              </div>

              {(carriesLoad(form.kind) || tractor) && (
                <div className="rounded-md border border-border p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>{tractor ? L("Capacité de la citerne (L)", "Tank capacity (L)") : L("Capacité totale (L)", "Total capacity (L)")}</Label>
                      <Input type="number" min={0} value={form.capacity_litres ?? ""} onChange={(e) => set("capacity_litres", e.target.value)} /></div>
                    <div><Label>{L("Nombre de compartiments", "Number of compartments")}</Label>
                      <Input type="number" min={0} max={12} value={form.comp_count ?? ""} onChange={(e) => setCount(e.target.value)} /></div>
                  </div>
                  {rows.length > 0 && (
                    <div className="space-y-2">
                      {rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-[6rem_1fr_1fr] gap-2 items-center">
                          <span className="text-sm text-muted-foreground">{L("Compart.", "Comp.")} {r.position}</span>
                          <Input type="number" min={0} placeholder={L("Capacité (L)", "Capacity (L)")} value={r.capacity_litres}
                            onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, capacity_litres: e.target.value === "" ? "" : Number(e.target.value) } : x)))} />
                          <Input placeholder={L("Réf. barème (option)", "Calibration ref (opt.)")} value={r.calibration_ref ?? ""}
                            onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, calibration_ref: e.target.value } : x)))} />
                        </div>
                      ))}
                      <p className={`text-xs ${Number(form.capacity_litres) && total !== Number(form.capacity_litres) ? "text-destructive" : "text-muted-foreground"}`}>
                        {L("Total compartiments", "Compartments total")} : {fmt(total)} L / {fmt(form.capacity_litres || 0)} L</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>{L("Annuler", "Cancel")}</Button>
            <Button onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{L("Enregistrer", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
