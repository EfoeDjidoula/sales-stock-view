import { Building2 } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRoles } from "@/hooks/useUserRoles";

export const TenantSelector = () => {
  const { tenants, tenantId, setTenantId, canSwitchTenant } = useTenant();
  const { isAdmin } = useUserRoles();

  if (!isAdmin || !canSwitchTenant || !tenantId) return null;

  return (
    <Select value={tenantId} onValueChange={setTenantId}>
      <SelectTrigger className="w-[220px] bg-card border-border hover:border-primary/50 transition-colors">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <SelectValue placeholder="Client" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.trade_name || t.name}</span>
              <span className="text-xs text-muted-foreground">({t.code})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
