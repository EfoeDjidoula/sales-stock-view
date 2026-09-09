import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModuleCatalog, MODULE_CATEGORY_LABELS } from "@/hooks/useModules";
import { useTenantModules } from "@/hooks/useTenantModules";
import { useCountries, useTenantCountries } from "@/hooks/useTenantCountries";
import { RotateCcw } from "lucide-react";

interface Props {
  tenantId: string | null;
  tenantName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LumatekClientModules = ({ tenantId, tenantName, open, onOpenChange }: Props) => {
  const { data: catalog = [], isLoading: loadingCatalog } = useModuleCatalog();
  const { data: countries = [] } = useCountries();
  const { tenantCountries } = useTenantCountries(tenantId);
  const {
    tenantModules,
    countryModules,
    isLoading,
    setTenantModule,
    setCountryModule,
  } = useTenantModules(tenantId);

  const [tab, setTab] = useState("client");

  const countryList = useMemo(
    () =>
      tenantCountries
        .map((tc) => countries.find((c) => c.id === tc.country_id))
        .filter(Boolean) as { id: string; name: string; flag: string | null; iso_code: string }[],
    [tenantCountries, countries]
  );

  const tenantEnabled = (key: string) => {
    const row = tenantModules.find((m) => m.module_key === key);
    return row ? row.is_enabled : true;
  };

  const countryOverride = (countryId: string, key: string) => {
    const row = countryModules.find((m) => m.country_id === countryId && m.module_key === key);
    return row ? row.is_enabled : null;
  };

  const loading = isLoading || loadingCatalog;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modules — {tenantName}</DialogTitle>
          <DialogDescription>
            Activez ou désactivez les modules pour cette société, puis appliquez si besoin une
            surcharge par pays. Un module désactivé disparaît de la navigation et ses données
            deviennent inaccessibles.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="client">Société</TabsTrigger>
              {countryList.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>
                  {c.flag ?? ""} {c.iso_code}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="client">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Activé</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((m) => (
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
                      <TableCell className="text-right">
                        <Switch
                          checked={tenantEnabled(m.key)}
                          onCheckedChange={(v) =>
                            setTenantModule.mutate({ moduleKey: m.key, enabled: v })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            {countryList.map((c) => (
              <TabsContent key={c.id} value={c.id}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Module</TableHead>
                      <TableHead>Réglage société</TableHead>
                      <TableHead className="text-right">Surcharge {c.name}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.map((m) => {
                      const override = countryOverride(c.id, m.key);
                      const base = tenantEnabled(m.key);
                      return (
                        <TableRow key={m.key}>
                          <TableCell className="font-medium">{m.label}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={base ? "border-emerald-500/30 text-emerald-400" : ""}
                            >
                              {base ? "Activé" : "Désactivé"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted-foreground">
                                {override === null ? "Hérité" : override ? "Activé" : "Désactivé"}
                              </span>
                              <Switch
                                checked={override === null ? base : override}
                                onCheckedChange={(v) =>
                                  setCountryModule.mutate({
                                    countryId: c.id,
                                    moduleKey: m.key,
                                    enabled: v,
                                  })
                                }
                              />
                              {override !== null && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Revenir au réglage société"
                                  onClick={() =>
                                    setCountryModule.mutate({
                                      countryId: c.id,
                                      moduleKey: m.key,
                                      enabled: null,
                                    })
                                  }
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
