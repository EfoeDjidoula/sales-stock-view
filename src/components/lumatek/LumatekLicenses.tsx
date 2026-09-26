import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLicenses, LICENSE_STATUSES, effectiveStatus, License, LicensePlan, LicenseStatus } from "@/hooks/useLicenses";
import { useLumatekTenants } from "@/hooks/useLumatekTenants";
import { useModuleCatalog } from "@/hooks/useModules";
import { Plus, Pencil, Trash2 } from "lucide-react";

const STATUS_META: Record<LicenseStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-muted text-muted-foreground border-border" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  expiring: { label: "Expire bientôt", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  expired: { label: "Expirée", className: "bg-destructive/15 text-destructive border-destructive/30" },
  suspended: { label: "Suspendue", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  terminated: { label: "Résiliée", className: "bg-muted text-muted-foreground border-border line-through" },
};

const toNum = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));
const lim = (v: number | null) => (v == null ? "∞" : String(v));
const today = () => new Date().toISOString().slice(0, 10);
const inOneYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

export const LumatekLicenses = () => {
  const { plans, licenses, usage, isLoading, savePlan, deletePlan, saveLicense } = useLicenses();
  const { tenants } = useLumatekTenants();
  const { data: catalog = [] } = useModuleCatalog();

  const [lic, setLic] = useState<Partial<License> | null>(null);
  const [plan, setPlan] = useState<(Partial<LicensePlan> & { modules: string[] }) | null>(null);
  const [toDelete, setToDelete] = useState<LicensePlan | null>(null);

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.trade_name || "—";
  const planOf = (id: string) => plans.find((p) => p.id === id);
  const unlicensed = tenants.filter((t) => !licenses.some((l) => l.tenant_id === t.id && l.status !== "terminated"));

  const submitLicense = async () => {
    if (!lic?.tenant_id || !lic.plan_id || !lic.start_date || !lic.expiration_date) return;
    if (lic.expiration_date < lic.start_date) return;
    await saveLicense.mutateAsync(lic);
    setLic(null);
  };
  const submitPlan = async () => {
    if (!plan?.code?.trim() || !plan.name?.trim()) return;
    await savePlan.mutateAsync(plan);
    setPlan(null);
  };

  const usageCell = (used: number, max: number | null) => (
    <span className={max != null && used >= max ? "text-destructive font-medium" : ""}>
      {used}/{lim(max)}
    </span>
  );

  const numField = (label: string, value: number | null | undefined, onChange: (v: number | null) => void, hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} value={value ?? ""} placeholder={hint ?? "Illimité"} onChange={(e) => onChange(toNum(e.target.value))} />
    </div>
  );

  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <Tabs defaultValue="licenses">
      <TabsList>
        <TabsTrigger value="licenses">Licences</TabsTrigger>
        <TabsTrigger value="plans">Plans</TabsTrigger>
      </TabsList>

      <TabsContent value="licenses">
        <Card className="border-indigo-500/20">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">
              Licences clients
              {unlicensed.length > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-400">{unlicensed.length} client(s) sans licence</span>
              )}
            </CardTitle>
            <Button className="gap-2" onClick={() => setLic({
              status: "draft", start_date: today(), expiration_date: inOneYear(), grace_period_days: 15,
              automatic_renewal: false, tenant_id: unlicensed[0]?.id, plan_id: plans[0]?.id,
            })}>
              <Plus className="h-4 w-4" /> Nouvelle licence
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° licence</TableHead><TableHead>Client</TableHead><TableHead>Plan</TableHead>
                  <TableHead>Période</TableHead><TableHead>Statut</TableHead>
                  <TableHead>Utilisateurs</TableHead><TableHead>Pays</TableHead><TableHead>Stations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((l) => {
                  const p = planOf(l.plan_id);
                  const st = effectiveStatus(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.license_number}</TableCell>
                      <TableCell>{tenantName(l.tenant_id)}</TableCell>
                      <TableCell>{p?.name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {l.start_date} → {l.expiration_date}
                        <div className="text-muted-foreground">Grâce {l.grace_period_days} j{l.automatic_renewal ? " · renouv. auto" : ""}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_META[st].className}>{STATUS_META[st].label}</Badge></TableCell>
                      <TableCell>{usageCell(usage.users[l.tenant_id] || 0, l.max_users ?? p?.max_users ?? null)}</TableCell>
                      <TableCell>{usageCell(usage.countries[l.tenant_id] || 0, l.max_countries ?? p?.max_countries ?? null)}</TableCell>
                      <TableCell>{usageCell(usage.stations[l.tenant_id] || 0, l.max_stations ?? p?.max_stations ?? null)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title="Modifier" onClick={() => setLic(l)}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {licenses.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Aucune licence.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="plans">
        <Card className="border-indigo-500/20">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">Plans de licence</CardTitle>
            <Button className="gap-2" onClick={() => setPlan({ code: "", name: "", is_active: true, modules: catalog.filter((m) => m.is_core).map((m) => m.key) })}>
              <Plus className="h-4 w-4" /> Nouveau plan
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead><TableHead>Nom</TableHead><TableHead>Modules</TableHead>
                  <TableHead>Utilisateurs</TableHead><TableHead>Pays</TableHead><TableHead>Stations</TableHead>
                  <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </TableCell>
                    <TableCell>{p.modules.length}/{catalog.length}</TableCell>
                    <TableCell>{lim(p.max_users)}</TableCell>
                    <TableCell>{lim(p.max_countries)}</TableCell>
                    <TableCell>{lim(p.max_stations)}</TableCell>
                    <TableCell>{p.is_active ? <Badge variant="outline">Actif</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactif</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="Modifier" onClick={() => setPlan({ ...p })}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" title="Supprimer" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Licence */}
      <Dialog open={!!lic} onOpenChange={(o) => !o && setLic(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{lic?.id ? "Modifier la licence" : "Nouvelle licence"}</DialogTitle>
            <DialogDescription>Les limites vides reprennent celles du plan. Elles sont contrôlées par le serveur.</DialogDescription>
          </DialogHeader>
          {lic && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={lic.tenant_id} onValueChange={(v) => setLic({ ...lic, tenant_id: v })} disabled={!!lic.id}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.trade_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan *</Label>
                <Select value={lic.plan_id} onValueChange={(v) => setLic({ ...lic, plan_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{plans.filter((p) => p.is_active || p.id === lic.plan_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>N° licence</Label>
                <Input value={lic.license_number ?? ""} placeholder="Généré automatiquement" onChange={(e) => setLic({ ...lic, license_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={lic.status} onValueChange={(v) => setLic({ ...lic, status: v as LicenseStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LICENSE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Date de début *</Label><Input type="date" value={lic.start_date ?? ""} onChange={(e) => setLic({ ...lic, start_date: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Date d'expiration *</Label>
                <Input type="date" min={lic.start_date} value={lic.expiration_date ?? ""} onChange={(e) => setLic({ ...lic, expiration_date: e.target.value })} />
                {lic.start_date && lic.expiration_date && lic.expiration_date < lic.start_date && (
                  <p className="text-xs text-destructive">L'expiration doit suivre le début.</p>
                )}
              </div>
              <div className="space-y-1.5"><Label>Date d'activation</Label><Input type="date" value={lic.activation_date ?? ""} onChange={(e) => setLic({ ...lic, activation_date: e.target.value })} /></div>
              {numField("Période de grâce (jours)", lic.grace_period_days, (v) => setLic({ ...lic, grace_period_days: v ?? 0 }), "15")}
              {numField("Utilisateurs max", lic.max_users, (v) => setLic({ ...lic, max_users: v }), `Plan : ${lim(planOf(lic.plan_id || "")?.max_users ?? null)}`)}
              {numField("Pays max", lic.max_countries, (v) => setLic({ ...lic, max_countries: v }), `Plan : ${lim(planOf(lic.plan_id || "")?.max_countries ?? null)}`)}
              {numField("Stations max", lic.max_stations, (v) => setLic({ ...lic, max_stations: v }), `Plan : ${lim(planOf(lic.plan_id || "")?.max_stations ?? null)}`)}
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={!!lic.automatic_renewal} onCheckedChange={(c) => setLic({ ...lic, automatic_renewal: c })} />
                <Label>Renouvellement automatique</Label>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Notes</Label><Textarea value={lic.notes ?? ""} onChange={(e) => setLic({ ...lic, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLic(null)}>Annuler</Button>
            <Button onClick={submitLicense} disabled={saveLicense.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan */}
      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{plan?.id ? "Modifier le plan" : "Nouveau plan"}</DialogTitle>
            <DialogDescription>Laissez une limite vide pour « illimité ». Les modules cœur restent toujours accessibles.</DialogDescription>
          </DialogHeader>
          {plan && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Code *</Label><Input value={plan.code ?? ""} onChange={(e) => setPlan({ ...plan, code: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Nom *</Label><Input value={plan.name ?? ""} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Input value={plan.description ?? ""} onChange={(e) => setPlan({ ...plan, description: e.target.value })} /></div>
                {numField("Utilisateurs max", plan.max_users, (v) => setPlan({ ...plan, max_users: v }))}
                {numField("Pays max", plan.max_countries, (v) => setPlan({ ...plan, max_countries: v }))}
                {numField("Stations max", plan.max_stations, (v) => setPlan({ ...plan, max_stations: v }))}
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={plan.is_active ?? true} onCheckedChange={(c) => setPlan({ ...plan, is_active: c })} />
                  <Label>Plan disponible</Label>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Modules autorisés ({plan.modules.length}/{catalog.length})</Label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, modules: catalog.map((m) => m.key) })}>Tout</Button>
                    <Button size="sm" variant="outline" onClick={() => setPlan({ ...plan, modules: catalog.filter((m) => m.is_core).map((m) => m.key) })}>Cœur seul</Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {catalog.map((m) => {
                    const checked = m.is_core || plan.modules.includes(m.key);
                    return (
                      <label key={m.key} className="flex items-center gap-2 rounded border border-border/50 px-2 py-1.5 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={m.is_core}
                          onCheckedChange={(c) => setPlan({
                            ...plan,
                            modules: c ? [...plan.modules, m.key] : plan.modules.filter((k) => k !== m.key),
                          })}
                        />
                        {m.label}{m.is_core && <span className="text-xs text-muted-foreground">(cœur)</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)}>Annuler</Button>
            <Button onClick={submitPlan} disabled={savePlan.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le plan « {toDelete?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action définitive. Un plan utilisé par une licence ne peut pas être supprimé : changez d'abord le plan de ces licences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (toDelete) deletePlan.mutate(toDelete.id); setToDelete(null); }}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
};
