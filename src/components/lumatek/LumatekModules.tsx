import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const LumatekModules = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["lumatek-modules"],
    queryFn: async () => {
      const [modulesRes, tenantsRes] = await Promise.all([
        supabase.from("tenant_modules").select("*").order("position"),
        supabase.from("tenants").select("id, trade_name"),
      ]);
      const tenants = tenantsRes.data || [];
      return (modulesRes.data || []).map((m) => ({
        ...m,
        tenantName: tenants.find((t) => t.id === m.tenant_id)?.trade_name || "—",
      }));
    },
  });

  return (
    <Card className="border-indigo-500/20">
      <CardHeader>
        <CardTitle className="text-base">Modules activés par client</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Rôles autorisés</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data || []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.tenantName}</TableCell>
                    <TableCell className="font-mono text-xs">{m.module_key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(m.allowed_roles || []).join(", ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={m.is_enabled ? "border-emerald-500/30 text-emerald-400" : ""}
                      >
                        {m.is_enabled ? "Activé" : "Désactivé"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(data || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      Aucun module configuré.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
