import { useMemo, useState } from "react";
import {
  useRbac,
  MODULE_LABELS,
  ACTION_LABELS,
  ACTION_ORDER,
  RbacRole,
} from "@/hooks/useRbac";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";

export const RolesPermissionsMatrix = () => {
  const {
    roles,
    permissions,
    rolePermissionSet,
    isLoading,
    toggleRolePermission,
    duplicateRole,
    createRole,
    deleteRole,
  } = useRbac();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");

  const selectedRole: RbacRole | null = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? roles[0] ?? null,
    [roles, selectedRoleId]
  );

  const modules = useMemo(() => {
    const set = new Set(permissions.map((p) => p.module));
    return Array.from(set).sort(
      (a, b) => (MODULE_LABELS[a] || a).localeCompare(MODULE_LABELS[b] || b)
    );
  }, [permissions]);

  const permissionOf = (module: string, action: string) =>
    permissions.find((p) => p.module === module && p.action === action) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="roles-skeleton">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Rôles</CardTitle>
            <CardDescription>Modèles fournis et rôles de votre société</CardDescription>
          </div>
          <Button size="icon" variant="outline" onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                selectedRole?.id === role.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{role.name}</span>
                {role.is_system ? (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Lock className="w-3 h-3" /> Fourni
                  </Badge>
                ) : (
                  <Badge className="text-[10px]">Personnalisé</Badge>
                )}
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                {selectedRole ? selectedRole.name : "Permissions"}
              </CardTitle>
              <CardDescription>
                {selectedRole?.is_system
                  ? "Rôle fourni d'origine : dupliquez-le pour adapter ses droits."
                  : "Cochez les actions autorisées pour ce rôle."}
              </CardDescription>
            </div>
            {selectedRole && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    const created = await duplicateRole(selectedRole);
                    if (created) setSelectedRoleId(created.id);
                  }}
                >
                  <Copy className="w-4 h-4" /> Dupliquer
                </Button>
                {!selectedRole.is_system && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive"
                    onClick={async () => {
                      await deleteRole(selectedRole.id);
                      setSelectedRoleId(null);
                    }}
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium">Module</th>
                {ACTION_ORDER.map((a) => (
                  <th key={a} className="px-2 py-2 font-medium text-center whitespace-nowrap">
                    {ACTION_LABELS[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module} className="border-b last:border-0">
                  <td className="py-2 pr-4">{MODULE_LABELS[module] || module}</td>
                  {ACTION_ORDER.map((action) => {
                    const perm = permissionOf(module, action);
                    const checked =
                      !!perm &&
                      !!selectedRole &&
                      rolePermissionSet.has(`${selectedRole.id}:${perm.id}`);
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        {perm ? (
                          <Checkbox
                            checked={checked}
                            disabled={!selectedRole || selectedRole.is_system}
                            aria-label={`${MODULE_LABELS[module] || module} — ${ACTION_LABELS[action]}`}
                            onCheckedChange={(value) =>
                              selectedRole &&
                              toggleRolePermission(selectedRole.id, perm.id, value === true)
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau rôle</DialogTitle>
            <DialogDescription>
              Créez un rôle propre à votre société, puis cochez ses permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Nom du rôle</Label>
              <Input
                id="role-name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Ex : Responsable Logistique"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="À quoi sert ce rôle ?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Annuler
              </Button>
              <Button
                disabled={!newRoleName.trim()}
                onClick={async () => {
                  const created = await createRole(newRoleName.trim(), newRoleDescription);
                  if (created) setSelectedRoleId(created.id);
                  setNewRoleName("");
                  setNewRoleDescription("");
                  setIsCreateOpen(false);
                }}
              >
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
