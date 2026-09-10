import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useModuleCatalog, MODULE_CATEGORY_LABELS } from "@/hooks/useModules";

export const LumatekModules = () => {
  const { data: catalog = [], isLoading: loadingCatalog } = useModuleCatalog();

  const { data, isLoading } = useQuery({
    queryKey: ["lumatek-modules"],
    queryFn: async () => {
      const [tenantsRes, tmRes, cmRes] = await Promise.all([
        supabase.from("tenants").select("id, trade_name"),
        supabase.from("tenant_modules").select("tenant_id, module_key, is_enabled"),
        supabase.from("country_modules").select("module_key, is_enabled"),
      ]);
      return {
        tenants: tenantsRes.data || [],
        tenantModules: tmRes.data || [],
        countryModules: cmRes.data || [],
      };
    },
  });

  const loading = isLoading || loadingCatalog;
  const tenantCount = data?.tenants.length ?? 0;

  return (
    <Card className="border-indigo-500/20">
      <CardHeader>
        <CardTitle className="text-base">Catalogue des modules</CardTitle>
        <CardDescription>
          Activation par client depuis Clients → bouton Modules, avec surcharge possible par pays.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Clients actifs</TableHead>
                  <TableHead>Surcharges pays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.map((m) => {
                  const rows = (data?.tenantModules || []).filter((t) => t.module_key === m.key);
                  const disabled = rows.filter((r) => !r.is_enabled).length;
                  const active = tenantCount - disabled;
                  const overrides = (data?.countryModules || []).filter(
                    (c) => c.module_key === m.key
                  ).length;
                  return (
                    <TableRow key={m.key}>
                      <TableCell>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{m.description}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {MODULE_CATEGORY_LABELS[m.category] ?? m.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={active > 0 ? "border-emerald-500/30 text-emerald-400" : ""}
                        >
                          {active} / {tenantCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {overrides > 0 ? `${overrides} pays` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
