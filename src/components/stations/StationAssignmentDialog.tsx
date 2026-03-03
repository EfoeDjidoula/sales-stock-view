import { useState } from "react";
import { UserWithRole } from "@/hooks/useUserRoles";
import { StationAssignment } from "@/hooks/useStationAssignments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X, Loader2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StationAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationName: string;
  stationId: string;
  assignedUsers: StationAssignment[];
  allUsers: UserWithRole[];
  onAssign: (userId: string, stationId: string) => Promise<void>;
  onUnassign: (userId: string, stationId: string) => Promise<void>;
}

export const StationAssignmentDialog = ({
  open,
  onOpenChange,
  stationName,
  stationId,
  assignedUsers,
  allUsers,
  onAssign,
  onUnassign,
}: StationAssignmentDialogProps) => {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const assignedUserIds = new Set(assignedUsers.map((a) => a.user_id));
  const availableUsers = allUsers.filter(
    (u) => !assignedUserIds.has(u.id) && u.is_active && (u.role === "operator" || u.role === "manager")
  );

  const handleAssign = async () => {
    if (!selectedUserId) return;
    setSubmitting(true);
    await onAssign(selectedUserId, stationId);
    setSelectedUserId("");
    setSubmitting(false);
  };

  const handleUnassign = async (userId: string) => {
    setSubmitting(true);
    await onUnassign(userId, stationId);
    setSubmitting(false);
  };

  const getUserName = (userId: string) => {
    const user = allUsers.find((u) => u.id === userId);
    return user?.full_name || user?.email || userId.slice(0, 8);
  };

  const getUserRole = (userId: string) => {
    const user = allUsers.find((u) => u.id === userId);
    return user?.role;
  };

  const roleLabels: Record<string, string> = {
    operator: "Opérateur",
    manager: "Manager",
    admin: "Admin",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Assignation – {stationName}</DialogTitle>
          <DialogDescription>
            Assignez des opérateurs ou managers à cette station.
          </DialogDescription>
        </DialogHeader>

        {/* Currently assigned */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Utilisateurs assignés ({assignedUsers.length})
          </p>
          {assignedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun utilisateur assigné</p>
          ) : (
            <div className="space-y-2">
              {assignedUsers.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{getUserName(a.user_id)}</span>
                    {getUserRole(a.user_id) && (
                      <Badge variant="outline" className="text-xs">
                        {roleLabels[getUserRole(a.user_id)!] || getUserRole(a.user_id)}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleUnassign(a.user_id)}
                    disabled={submitting}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new */}
        {availableUsers.length > 0 && (
          <div className="flex items-end gap-2 pt-2 border-t border-border">
            <div className="flex-1">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un utilisateur" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.id.slice(0, 8)} – {roleLabels[u.role || ""] || "Sans rôle"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} disabled={!selectedUserId || submitting} size="sm" className="gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Assigner
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
