import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AccessDenied } from "@/components/AccessDenied";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Building2 } from "lucide-react";
import { toast } from "sonner";

const CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GHS", "NGN"];
const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
];

interface FormState {
  code: string;
  name: string;
  legal_name: string;
  trade_name: string;
  primary_color: string;
  secondary_color: string;
  default_currency: string;
  default_language: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  legal_name: "",
  trade_name: "",
  primary_color: "",
  secondary_color: "",
  default_currency: "XOF",
  default_language: "fr",
  email: "",
  phone: "",
  address: "",
  website: "",
};

export const TenantSettingsModule = () => {
  const { tenant, tenantId, isLoading, refetchTenants } = useTenant();
  const { isAdmin } = useUserRoles();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setForm({
      code: tenant.code ?? "",
      name: tenant.name ?? "",
      legal_name: tenant.legal_name ?? "",
      trade_name: tenant.trade_name ?? "",
      primary_color: tenant.primary_color ?? "",
      secondary_color: tenant.secondary_color ?? "",
      default_currency: tenant.default_currency ?? "XOF",
      default_language: tenant.default_language ?? "fr",
      email: tenant.email ?? "",
      phone: tenant.phone ?? "",
      address: tenant.address ?? "",
      website: tenant.website ?? "",
    });
  }, [tenant]);

  if (!isAdmin) {
    return <AccessDenied />;
  }

  if (isLoading || !tenantId) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Le code et la raison sociale sont obligatoires");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          code: form.code.trim(),
          name: form.name.trim(),
          legal_name: form.legal_name.trim() || null,
          trade_name: form.trade_name.trim() || form.name.trim(),
          primary_color: form.primary_color.trim(),
          secondary_color: form.secondary_color.trim(),
          default_currency: form.default_currency,
          default_language: form.default_language,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          website: form.website.trim() || null,
        })
        .eq("id", tenantId);
      if (error) throw error;
      refetchTenants();
      toast.success("Paramètres du client enregistrés");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      toast.error(`Enregistrement impossible : ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Paramètres du client
          </CardTitle>
          <CardDescription>
            Informations de la société active. Toutes les données de l'application sont
            isolées par client.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tenant-code">Code client</Label>
            <Input id="tenant-code" value={form.code} onChange={set("code")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Raison sociale</Label>
            <Input id="tenant-name" value={form.name} onChange={set("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-legal">Dénomination légale</Label>
            <Input id="tenant-legal" value={form.legal_name} onChange={set("legal_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-trade">Nom commercial</Label>
            <Input id="tenant-trade" value={form.trade_name} onChange={set("trade_name")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-primary">Couleur principale (HSL)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tenant-primary"
                value={form.primary_color}
                onChange={set("primary_color")}
                placeholder="25 95% 53%"
              />
              <span
                className="h-9 w-9 rounded-md border border-border shrink-0"
                style={{ background: `hsl(${form.primary_color})` }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-secondary">Couleur secondaire (HSL)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tenant-secondary"
                value={form.secondary_color}
                onChange={set("secondary_color")}
                placeholder="38 92% 50%"
              />
              <span
                className="h-9 w-9 rounded-md border border-border shrink-0"
                style={{ background: `hsl(${form.secondary_color})` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Devise par défaut</Label>
            <Select
              value={form.default_currency}
              onValueChange={(v) => setForm((f) => ({ ...f, default_currency: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Langue par défaut</Label>
            <Select
              value={form.default_language}
              onValueChange={(v) => setForm((f) => ({ ...f, default_language: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-email">Email</Label>
            <Input id="tenant-email" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-phone">Téléphone</Label>
            <Input id="tenant-phone" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-address">Adresse</Label>
            <Input id="tenant-address" value={form.address} onChange={set("address")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-website">Site web</Label>
            <Input id="tenant-website" value={form.website} onChange={set("website")} />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
