import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLumatekTenants, TenantStatus, TenantInput } from "@/hooks/useLumatekTenants";
import { LumatekClientCountries } from "./LumatekClientCountries";
import { Plus, Pencil, Eye, PauseCircle, PlayCircle, Archive, Globe2 } from "lucide-react";

const STATUS_META: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  suspended: { label: "Suspendu", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  archived: { label: "Archivé", className: "bg-muted text-muted-foreground border-border" },
};

const emptyForm: TenantInput = {
  code: "",
  name: "",
  trade_name: "",
  legal_name: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  default_currency: "XOF",
  default_language: "fr",
  status: "active",
};

export const LumatekClients = () => {
  const { tenants, isLoading, createTenant, updateTenant, setStatus } = useLumatekTenants();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TenantInput>(emptyForm);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; status: TenantStatus } | null>(null);
  const [countriesId, setCountriesId] = useState<string | null>(null);


  const viewed = tenants.find((t) => t.id === viewId) || null;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    const t = tenants.find((x) => x.id === id);
    if (!t) return;
    setEditingId(id);
    setForm({
      code: t.code,
      name: t.name,
      trade_name: t.trade_name,
      legal_name: t.legal_name || "",
      email: t.email || "",
      phone: t.phone || "",
      address: t.address || "",
      website: t.website || "",
      default_currency: t.default_currency,
      default_language: t.default_language,
      status: t.status as TenantStatus,
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.trade_name.trim()) return;
    if (editingId) {
      await updateTenant.mutateAsync({ id: editingId, input: form });
    } else {
      await createTenant.mutateAsync(form);
    }
    setFormOpen(false);
  };

  const field = (key: keyof TenantInput, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
        value={(form[key] as string) ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Card className="border-indigo-500/20">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Clients de la plateforme</CardTitle>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Nouveau client
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Nom commercial</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => {
                  const meta = STATUS_META[t.status] || STATUS_META.active;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{t.trade_name}</div>
                        <div className="text-xs text-muted-foreground">{t.legal_name || t.name}</div>
                      </TableCell>
                      <TableCell>{t.default_currency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setViewId(t.id)} title="Consulter">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(t.id)} title="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setCountriesId(t.id)} title="Pays">
                            <Globe2 className="h-4 w-4 text-indigo-300" />
                          </Button>

                          {t.status !== "active" ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Activer"
                              onClick={() => setPending({ id: t.id, status: "active" })}
                            >
                              <PlayCircle className="h-4 w-4 text-emerald-400" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Suspendre"
                              onClick={() => setPending({ id: t.id, status: "suspended" })}
                            >
                              <PauseCircle className="h-4 w-4 text-amber-400" />
                            </Button>
                          )}
                          {t.status !== "archived" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Archiver"
                              onClick={() => setPending({ id: t.id, status: "archived" })}
                            >
                              <Archive className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {tenants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Aucun client enregistré.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Création / modification */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le client" : "Nouveau client"}</DialogTitle>
            <DialogDescription>
              Informations de la société cliente hébergée sur la plateforme LUMATEK.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("code", "Code client *")}
            {field("trade_name", "Nom commercial *")}
            {field("name", "Nom *")}
            {field("legal_name", "Raison sociale")}
            {field("email", "Email", "email")}
            {field("phone", "Téléphone")}
            {field("website", "Site web")}
            {field("address", "Adresse")}
            {field("default_currency", "Devise")}
            {field("default_language", "Langue")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={createTenant.isPending || updateTenant.isPending}>
              {editingId ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Consultation */}
      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewed?.trade_name}</DialogTitle>
            <DialogDescription>Fiche client</DialogDescription>
          </DialogHeader>
          {viewed && (
            <div className="grid gap-2 text-sm">
              {[
                ["Code", viewed.code],
                ["Raison sociale", viewed.legal_name || "—"],
                ["Statut", STATUS_META[viewed.status]?.label || viewed.status],
                ["Email", viewed.email || "—"],
                ["Téléphone", viewed.phone || "—"],
                ["Adresse", viewed.address || "—"],
                ["Site web", viewed.website || "—"],
                ["Devise", viewed.default_currency],
                ["Langue", viewed.default_language],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4 border-b border-border/50 py-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-right">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pays affectés au client */}
      <LumatekClientCountries
        tenantId={countriesId}
        tenantName={tenants.find((t) => t.id === countriesId)?.trade_name}
        open={!!countriesId}
        onOpenChange={(o) => !o && setCountriesId(null)}
      />

      {/* Confirmation de changement de statut */}
      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.status === "active" && "Activer ce client ?"}
              {pending?.status === "suspended" && "Suspendre ce client ?"}
              {pending?.status === "archived" && "Archiver ce client ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.status === "suspended" &&
                "Les utilisateurs de ce client conserveront leurs données mais l'accès sera considéré comme suspendu."}
              {pending?.status === "archived" &&
                "Le client sera archivé et retiré des clients actifs. Aucune donnée n'est supprimée."}
              {pending?.status === "active" && "Le client redeviendra actif sur la plateforme."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) setStatus.mutate(pending);
                setPending(null);
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
