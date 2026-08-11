import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CountryRow {
  id: string;
  code: string;
  iso_code: string;
  name: string;
  flag: string | null;
  currency_code: string;
  currency_symbol: string;
  default_currency: string;
  vat_rate: number;
  locale: string;
  default_language: string;
  timezone: string;
  is_active: boolean;
}

const emptyForm = {
  name: "",
  code: "",
  iso_code: "",
  flag: "",
  currency_code: "XOF",
  currency_symbol: "FCFA",
  vat_rate: "18",
  locale: "fr-FR",
  default_language: "fr",
  timezone: "Africa/Porto-Novo",
};

type FormState = typeof emptyForm;

export const LumatekCountries = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CountryRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["lumatek-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select(
          "id, code, iso_code, name, flag, currency_code, currency_symbol, default_currency, vat_rate, locale, default_language, timezone, is_active"
        )
        .order("name");
      if (error) throw error;
      return (data || []) as CountryRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lumatek-countries"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-countries"] });
    queryClient.invalidateQueries({ queryKey: ["tenant-countries"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        iso_code: (values.iso_code || values.code).trim().toUpperCase(),
        flag: values.flag.trim() || null,
        currency_code: values.currency_code.trim().toUpperCase(),
        default_currency: values.currency_code.trim().toUpperCase(),
        currency_symbol: values.currency_symbol.trim(),
        vat_rate: Number(values.vat_rate) || 0,
        locale: values.locale.trim(),
        default_language: values.default_language.trim(),
        timezone: values.timezone.trim(),
      };
      if (editing) {
        const { error } = await supabase.from("countries").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("countries").insert({ ...payload, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Pays mis à jour" : "Pays ajouté");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("countries").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_active ? "Pays activé" : "Pays désactivé");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: CountryRow) => {
    setEditing(c);
    setForm({
      name: c.name,
      code: c.code,
      iso_code: c.iso_code,
      flag: c.flag || "",
      currency_code: c.currency_code,
      currency_symbol: c.currency_symbol,
      vat_rate: String(c.vat_rate),
      locale: c.locale,
      default_language: c.default_language,
      timezone: c.timezone,
    });
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Le nom et le code pays sont obligatoires");
      return;
    }
    saveMutation.mutate(form);
  };

  const field = (key: keyof FormState, label: string, placeholder?: string) => (
    <div className="space-y-2">
      <Label htmlFor={`country-${key}`}>{label}</Label>
      <Input
        id={`country-${key}`}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Card className="border-indigo-500/20">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Pays pris en charge</CardTitle>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Ajouter un pays
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Pays</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead>TVA</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data || []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <span className="mr-2" aria-hidden="true">{c.flag || "🏳️"}</span>
                    {c.name}
                  </TableCell>
                  <TableCell>{c.currency_code}</TableCell>
                  <TableCell>{Number(c.vat_rate)}%</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={c.is_active ? "border-emerald-500/30 text-emerald-400" : ""}
                    >
                      {c.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <Switch
                        checked={c.is_active}
                        aria-label={`Activer ${c.name}`}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                      />
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(data || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Aucun pays configuré.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le pays" : "Ajouter un pays"}</DialogTitle>
            <DialogDescription>
              Paramètres régionaux appliqués aux clients rattachés à ce pays.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("name", "Nom du pays", "Togo")}
              {field("code", "Code (2 lettres)", "TG")}
              {field("iso_code", "Code ISO", "TGO")}
              {field("flag", "Drapeau (emoji)", "🇹🇬")}
              {field("currency_code", "Devise", "XOF")}
              {field("currency_symbol", "Symbole", "FCFA")}
              {field("vat_rate", "Taux de TVA (%)", "18")}
              {field("default_language", "Langue", "fr")}
              {field("locale", "Locale", "fr-FR")}
              {field("timezone", "Fuseau horaire", "Africa/Lome")}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Enregistrement..." : editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
