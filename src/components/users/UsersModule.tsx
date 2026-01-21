import { useState } from "react";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ShieldCheck, User, UserCog, Crown, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; className: string; description: string }> = {
  admin: {
    label: "Administrateur",
    icon: <Crown className="w-4 h-4" />,
    className: "bg-red-100 text-red-800 border-red-300",
    description: "Accès complet à toutes les fonctionnalités",
  },
  manager: {
    label: "Manager",
    icon: <ShieldCheck className="w-4 h-4" />,
    className: "bg-blue-100 text-blue-800 border-blue-300",
    description: "Gestion des stations et rapports",
  },
  operator: {
    label: "Opérateur",
    icon: <User className="w-4 h-4" />,
    className: "bg-green-100 text-green-800 border-green-300",
    description: "Saisie des données uniquement",
  },
};

export const UsersModule = () => {
  const { user } = useAuth();
  const { users, currentUserRole, isAdmin, loading, assignRole, removeRole } = useUserRoles();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>("operator");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState<string | null>(null);

  const handleAssignRole = async () => {
    if (!selectedUser) return;
    await assignRole(selectedUser, selectedRole);
    setIsDialogOpen(false);
    setSelectedUser(null);
  };

  const handleRemoveRole = async () => {
    if (!userToRemove) return;
    await removeRole(userToRemove);
    setUserToRemove(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show access denied if not admin
  if (!isAdmin && currentUserRole !== null) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Accès restreint</h3>
                <p className="text-muted-foreground">
                  Seuls les administrateurs peuvent gérer les rôles utilisateurs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Votre rôle actuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentUserRole ? (
              <div className="flex items-center gap-3">
                <Badge className={`gap-1 ${roleConfig[currentUserRole].className}`}>
                  {roleConfig[currentUserRole].icon}
                  {roleConfig[currentUserRole].label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {roleConfig[currentUserRole].description}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">Aucun rôle attribué</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // First admin setup - if no admin exists yet
  if (currentUserRole === null && users.every((u) => u.role !== "admin")) {
    return (
      <div className="space-y-6">
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary" />
              Configuration initiale
            </CardTitle>
            <CardDescription>
              Aucun administrateur n'est configuré. Attribuez-vous le rôle d'administrateur pour commencer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => user && assignRole(user.id, "admin")}
              className="gap-2"
            >
              <Crown className="w-4 h-4" />
              Devenir administrateur
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-semibold">Gestion des Utilisateurs</h2>
          <p className="text-sm text-muted-foreground">
            Attribuez et gérez les rôles des utilisateurs
          </p>
        </div>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(roleConfig) as AppRole[]).map((role) => (
          <Card key={role} className="border-l-4" style={{ borderLeftColor: role === "admin" ? "#ef4444" : role === "manager" ? "#3b82f6" : "#22c55e" }}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                {roleConfig[role].icon}
                <span className="font-medium">{roleConfig[role].label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{roleConfig[role].description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Liste des utilisateurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun utilisateur enregistré</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle actuel</TableHead>
                    <TableHead>Date d'inscription</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{u.full_name || "Sans nom"}</p>
                            {u.id === user?.id && (
                              <span className="text-xs text-muted-foreground">(Vous)</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.role ? (
                          <Badge className={`gap-1 ${roleConfig[u.role].className}`}>
                            {roleConfig[u.role].icon}
                            {roleConfig[u.role].label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Non attribué</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(u.created_at), "dd MMM yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(u.id);
                              setSelectedRole(u.role || "operator");
                              setIsDialogOpen(true);
                            }}
                          >
                            {u.role ? "Modifier" : "Attribuer"}
                          </Button>
                          {u.role && u.id !== user?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setUserToRemove(u.id)}
                            >
                              Retirer
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Role Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Attribuer un rôle
            </DialogTitle>
            <DialogDescription>
              Sélectionnez le rôle à attribuer à cet utilisateur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(roleConfig) as AppRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    <div className="flex items-center gap-2">
                      {roleConfig[role].icon}
                      <span>{roleConfig[role].label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {roleConfig[selectedRole].description}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleAssignRole}>
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Role Confirmation */}
      <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer le rôle ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utilisateur n'aura plus accès aux fonctionnalités associées à son rôle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
