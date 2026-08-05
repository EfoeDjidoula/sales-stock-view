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

export const LumatekUsers = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["lumatek-users"],
    queryFn: async () => {
      const [profilesRes, rolesRes, tenantsRes] = await Promise.all([
        supabase.from("profiles").select("id, user_id, full_name, is_active, tenant_id, created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("tenants").select("id, trade_name"),
      ]);
      const roles = rolesRes.data || [];
      const tenants = tenantsRes.data || [];
      return (profilesRes.data || []).map((p) => ({
        id: p.id,
        name: p.full_name || "—",
        role: roles.find((r) => r.user_id === p.user_id)?.role || "—",
        tenant: tenants.find((t) => t.id === p.tenant_id)?.trade_name || "—",
        isActive: p.is_active !== false,
        createdAt: p.created_at as string,
      }));
    },
  });

  return (
    <Card className="border-indigo-500/20">
      <CardHeader>
        <CardTitle className="text-base">Utilisateurs de la plateforme</CardTitle>
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
                  <TableHead>Nom</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data || []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.tenant}</TableCell>
                    <TableCell className="capitalize">{u.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={u.isActive ? "border-emerald-500/30 text-emerald-400" : ""}>
                        {u.isActive ? "Actif" : "Désactivé"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
