import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useStations } from "@/hooks/useStations";
import { useStationAssignments } from "@/hooks/useStationAssignments";
import { useRbac } from "@/hooks/useRbac";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: { id: string; full_name: string | null; is_active: boolean } | null;
  onToggleActive?: (userId: string, isActive: boolean) => void | Promise<void>;
}

export const UserAccessDialog = ({ open, onOpenChange, targetUser, onToggleActive }: Props) => {
  const { tenant, tenantId } = useTenant();
  const { stations } = useStations();
  const { getAssignedStations, refetch: refetchAssignments } = useStationAssignments();
  const {
    roles,
    getUserRoleId,
    getUserCountryIds,
    setUserRole,
    setUserCountries,
    setUserStations,
  } = useRbac();

  const [roleId, setRoleId] = useState<string>("");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [stationIds, setStationIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const countriesQuery = useQuery({
    queryKey: ["tenant-active-countries", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_countries")
        .select("country_id, countries ( id, name, flag )")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.country_id as string,
        name: (r.countries as { name?: string } | null)?.name ?? "Pays",
        flag: (r.countries as { flag?: string | null } | null)?.flag ?? "",
      }));
    },
    enabled: !!tenantId && open,
  });

  useEffect(() => {
    if (!open || !targetUser) return;
    setRoleId(getUserRoleId(targetUser.id) ?? "");
    setCountryIds(getUserCountryIds(targetUser.id));
    setStationIds(getAssignedStations(targetUser.id).map((a) => a.station_id));
    setIsActive(targetUser.is_active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetUser?.id]);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((v) => v !== id) : [...list, id];

  const handleSave = async () => {
    if (!targetUser) return;
    setSaving(true);
    try {
      await setUserRole(targetUser.id, roleId || null);
      await setUserCountries(targetUser.id, countryIds);
      await setUserStations(targetUser.id, stationIds);
      if (onToggleActive && isActive !== targetUser.is_active) {
        await onToggleActive(targetUser.id, isActive);
      }
      await refetchAssignments();
      toast.success("Accès mis à jour");
      onOpenChange(false);
    } catch {
      // les messages d'erreur détaillés sont déjà affichés
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Accès de {targetUser?.full_name || "l'utilisateur"}</DialogTitle>
          <DialogDescription>
            Société, pays autorisés, rôle, stations autorisées et statut du compte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Société</Label>
            <p className="text-sm rounded-md border bg-muted/40 px-3 py-2">
              {tenant?.name ?? "—"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Rôle</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Pays autorisés</Label>
            <div className="grid grid-cols-2 gap-2">
              {(countriesQuery.data || []).map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer"
                >
                  <Checkbox
                    checked={countryIds.includes(c.id)}
                    onCheckedChange={() => setCountryIds((prev) => toggle(prev, c.id))}
                  />
                  <span className="text-sm">
                    {c.flag} {c.name}
                  </span>
                </label>
              ))}
              {!countriesQuery.data?.length && (
                <p className="text-sm text-muted-foreground">
                  Aucun pays actif pour cette société.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Stations autorisées (facultatif)</Label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {stations.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer"
                >
                  <Checkbox
                    checked={stationIds.includes(s.id)}
                    onCheckedChange={() => setStationIds((prev) => toggle(prev, s.id))}
                  />
                  <span className="text-sm">{s.name}</span>
                </label>
              ))}
              {!stations.length && (
                <p className="text-sm text-muted-foreground">Aucune station disponible.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label>Compte actif</Label>
              <p className="text-xs text-muted-foreground">
                Un compte désactivé ne peut plus se connecter.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
