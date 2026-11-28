import { useEffect, useMemo, useState } from "react";
import { useRbac, MODULE_LABELS, ACTION_LABELS, ACTION_ORDER } from "@/hooks/useRbac";
import { usePermissions } from "@/hooks/usePermissions";
import { changePermissionChoices } from "@/lib/permissionChoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Lock, Plus, ShieldCheck, Trash2, Search, Save, RotateCcw, Loader2 } from "lucide-react";

export const RolesPermissionsMatrix = () => {
  const { roles, permissions, rolePermissionSet, assignments, isLoading, saveRolePermissions, duplicateRole, createRole, deleteRole } = useRbac();
  const { can } = usePermissions();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null;
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const baselineKey = permissions.filter((p) => selectedRole && rolePermissionSet.has(`${selectedRole.id}:${p.id}`)).map((p) => p.id).sort().join(",");
  const baseline = useMemo(() => new Set(baselineKey ? baselineKey.split(",") : []), [baselineKey]);
  useEffect(() => { setDraft(new Set(baseline)); }, [selectedRole?.id, baseline]);
  const changes = permissions.filter((p) => draft.has(p.id) !== baseline.has(p.id)).length;
  const editable = !!selectedRole && !selectedRole.is_system && can("users.administer");
  const groups = Array.from(new Set(permissions.map((p) => p.group_label || "Droits communs"))).sort();
  const modules = Array.from(new Set(permissions.map((p) => p.module))).map((module) => {
    const choices = permissions.filter((p) => p.module === module).sort((a, b) => {
      const ai = ACTION_ORDER.indexOf(a.action), bi = ACTION_ORDER.indexOf(b.action);
      return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.label.localeCompare(b.label);
    });
    return { module, choices, label: choices[0]?.screen_label || MODULE_LABELS[module] || module, group: choices[0]?.group_label || "Droits communs" };
  }).filter((item) => (group === "all" || group === item.group) && `${item.label} ${item.choices.map((p) => ACTION_LABELS[p.action] || p.label).join(" ")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const selectRole = (id: string) => {
    if (changes && !window.confirm("Abandonner les modifications non enregistrées de ce profil ?")) return;
    setSelectedRoleId(id);
  };
  const change = (ids: string[], enabled: boolean) => setDraft((current) => changePermissionChoices(permissions, current, ids, enabled));
  const affected = assignments.filter((a) => a.role_id === selectedRole?.id).length;

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  return <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
    <aside className="min-w-0 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Profils métier <span className="text-muted-foreground">({roles.length})</span></h3><Button size="icon" variant="outline" title="Créer un profil" aria-label="Créer un profil" disabled={!can("users.administer")} onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4" /></Button></div>
      <div className="lg:hidden"><Select value={selectedRole?.id} onValueChange={selectRole}><SelectTrigger aria-label="Choisir un profil métier"><SelectValue /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="hidden space-y-2 lg:block lg:max-h-[75vh] lg:overflow-y-auto">
        {roles.map((role) => <Button key={role.id} variant="outline" onClick={() => selectRole(role.id)} className={`h-auto w-full justify-start whitespace-normal p-3 text-left ${selectedRole?.id === role.id ? "border-primary bg-primary/5" : ""}`}>
          <span className="block w-full"><span className="flex items-start justify-between gap-2"><span>{role.name}</span>{role.is_system && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{role.is_system ? "Modèle fourni" : "Profil personnalisable"} · {assignments.filter((a) => a.role_id === role.id).length} utilisateur(s)</span></span>
        </Button>)}
      </div>
    </aside>
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div><h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" />{selectedRole?.name || "Permissions"}</h3><p className="mt-1 text-sm text-muted-foreground">{selectedRole?.description}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{draft.size} droits cochés</Badge><Badge variant="outline">{affected} utilisateur(s) concerné(s)</Badge></div></div>
        <div className="flex gap-2">{selectedRole && <Button variant="outline" size="sm" disabled={saving || !can("users.administer")} onClick={async () => { if (changes && !window.confirm("Dupliquer les droits enregistrés, sans les modifications en cours ?")) return; setSaving(true); const created = await duplicateRole(selectedRole); if (created) setSelectedRoleId(created.id); setSaving(false); }}><Copy className="mr-2 h-4 w-4" />{selectedRole.is_system ? "Personnaliser ce modèle" : "Dupliquer"}</Button>}{editable && <Button size="icon" variant="outline" aria-label="Supprimer ce profil" title={affected ? "Profil attribué : suppression impossible" : "Supprimer ce profil"} disabled={saving || affected > 0} onClick={() => setPendingDelete(true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
      </div>
      {selectedRole?.is_system && <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">Ce modèle est protégé. « Personnaliser ce modèle » crée votre copie modifiable, à attribuer ensuite aux utilisateurs.</p>}
      <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Rechercher un écran ou une action" className="pl-9" placeholder="Rechercher un écran ou une action…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Select value={group} onValueChange={setGroup}><SelectTrigger className="w-full sm:w-64" aria-label="Filtrer les pôles métier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les pôles métier</SelectItem>{groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
      {editable && <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{modules.length} écrans / domaines</span><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => change(modules.flatMap((m) => m.choices.map((p) => p.id)), true)}>Tout cocher dans le filtre</Button><Button variant="ghost" size="sm" onClick={() => change(modules.flatMap((m) => m.choices.map((p) => p.id)), false)}>Tout décocher dans le filtre</Button></div></div>}
      <div className="divide-y border-y">
        {modules.map((item, index) => <div key={item.module}>
          {(index === 0 || modules[index - 1]?.group !== item.group) && <h4 className="bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-normal text-muted-foreground">{item.group}</h4>}
          <fieldset className="px-3 py-4"><legend className="sr-only">{item.label}</legend><div className="mb-3 flex items-center justify-between gap-2"><span className="font-medium">{item.label}</span><span className="text-xs text-muted-foreground">{item.choices.filter((p) => draft.has(p.id)).length} / {item.choices.length}</span></div>
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">{item.choices.map((p) => <label key={p.id} className={`flex min-w-0 items-start gap-2 text-sm ${editable ? "cursor-pointer" : ""}`} title={p.prerequisites?.length ? `Droit commun requis : ${p.prerequisites.map((code) => { const parent = permissions.find((x) => x.code === code); return parent ? `${parent.screen_label || MODULE_LABELS[parent.module] || parent.module} — ${ACTION_LABELS[parent.action] || parent.label}` : code; }).join(" ou ")}` : undefined}>
              <Checkbox className="mt-0.5 shrink-0" checked={draft.has(p.id)} disabled={!editable || saving} aria-label={`${item.label} — ${ACTION_LABELS[p.action] || p.label}`} onCheckedChange={(value) => change([p.id], value === true)} /><span className="min-w-0 break-words">{ACTION_LABELS[p.action] || p.label}</span>
            </label>)}</div>
          </fieldset>
        </div>)}
        {!modules.length && <p className="py-8 text-center text-muted-foreground">Aucun droit ne correspond à la recherche.</p>}
      </div>
      {editable && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3"><span className="text-sm text-muted-foreground">{changes ? `${changes} modification(s) non enregistrée(s)` : "Droits enregistrés"}</span><div className="flex gap-2"><Button variant="outline" disabled={!changes || saving} onClick={() => setDraft(new Set(baseline))}><RotateCcw className="mr-2 h-4 w-4" />Annuler</Button><Button disabled={!changes || saving} onClick={async () => { if (!selectedRole) return; setSaving(true); await saveRolePermissions(selectedRole.id, [...draft]); setSaving(false); }}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer les droits</Button></div></div>}
    </section>
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}><DialogContent><DialogHeader><DialogTitle>Nouveau profil métier</DialogTitle><DialogDescription>Ce profil démarre sans aucun droit.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="role-name">Nom du profil</Label><Input id="role-name" maxLength={100} value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="Ex. Directeur d’exploitation" /></div><div className="space-y-2"><Label htmlFor="role-desc">Description</Label><Input id="role-desc" value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setIsCreateOpen(false)}>Annuler</Button><Button disabled={newRoleName.trim().length < 2 || saving} onClick={async () => { setSaving(true); const created = await createRole(newRoleName.trim(), newRoleDescription); if (created) { setSelectedRoleId(created.id); setNewRoleName(""); setNewRoleDescription(""); setIsCreateOpen(false); } setSaving(false); }}>Créer le profil</Button></div></div></DialogContent></Dialog>
    <Dialog open={pendingDelete} onOpenChange={setPendingDelete}><DialogContent><DialogHeader><DialogTitle>Supprimer ce profil ?</DialogTitle><DialogDescription>{selectedRole?.name} sera supprimé. Les profils attribués à des utilisateurs sont protégés.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingDelete(false)}>Annuler</Button><Button variant="destructive" disabled={saving} onClick={async () => { if (!selectedRole) return; setSaving(true); if (await deleteRole(selectedRole.id)) { setSelectedRoleId(null); setPendingDelete(false); } setSaving(false); }}>Supprimer</Button></div></DialogContent></Dialog>
  </div>;
};
