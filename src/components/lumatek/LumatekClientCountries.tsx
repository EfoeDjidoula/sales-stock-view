import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCountries, useTenantCountries } from "@/hooks/useTenantCountries";
import { Plus, Star } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendu",
  archived: "Archivé",
};

interface Props {
  tenantId: string | null;
  tenantName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LumatekClientCountries = ({ tenantId, tenantName, open, onOpenChange }: Props) => {
  const { data: countries = [], isLoading: loadingCountries } = useCountries();
  const { tenantCountries, isLoading, assignCountry, updateCountry, setDefaultCountry } =
    useTenantCountries(tenantId);

  const [addOpen, setAddOpen] = useState(false);
  const [countryId, setCountryId] = useState("");
  const [currency, setCurrency] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState("active");

  const byId = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.id, c])),
    [countries]
  );

  const available = countries.filter(
    (c) => !tenantCountries.some((tc) => tc.country_id === c.id)
  );

  const pickCountry = (id: string) => {
    setCountryId(id);
    const c = byId[id];
    if (c) {
      setCurrency(c.default_currency);
      setTimezone(c.timezone);
      setLanguage(c.default_language);
    }
  };

  const submit = async () => {
    if (!countryId) return;
    await assignCountry.mutateAsync({
      country_id: countryId,
      currency,
      timezone,
      language,
      status,
      is_default: tenantCountries.length === 0,
    });
    setAddOpen(false);
    setCountryId("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pays — {tenantName}</DialogTitle>
            <DialogDescription>
              Affectez un ou plusieurs pays à cette société. Chaque pays dispose de sa propre
              devise, fuseau horaire et langue, sur le même socle applicatif.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)} disabled={!available.length}>
              <Plus className="h-4 w-4" /> Affecter un pays
            </Button>
          </div>

          {isLoading || loadingCountries ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pays</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead>Fuseau</TableHead>
                    <TableHead>Langue</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantCountries.map((tc) => {
                    const c = byId[tc.country_id];
                    return (
                      <TableRow key={tc.id}>
                        <TableCell>
                          {c ? `${c.flag ?? ""} ${c.name} (${c.iso_code})` : tc.country_id}
                        </TableCell>
                        <TableCell>{tc.currency}</TableCell>
                        <TableCell className="text-xs">{tc.timezone}</TableCell>
                        <TableCell>{tc.language}</TableCell>
                        <TableCell>
                          <Select
                            value={tc.status}
                            onValueChange={(v) =>
                              updateCountry.mutate({ id: tc.id, input: { status: v } })
                            }
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                                <SelectItem key={v} value={v}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {tc.is_default ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                              Principal
                            </Badge>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Définir comme pays principal"
                              onClick={() => setDefaultCountry.mutate(tc.id)}
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {tenantCountries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        Aucun pays affecté.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Affecter un pays</DialogTitle>
            <DialogDescription>
              Les valeurs par défaut du pays sont proposées et restent modifiables.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Pays</Label>
              <Select value={countryId} onValueChange={pickCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un pays" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag ?? ""} {c.name} ({c.iso_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Devise</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Langue</Label>
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fuseau horaire</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={!countryId || assignCountry.isPending}>
              Affecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
