import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCountry } from "@/hooks/useCountry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  { key: "legal_name", label: "Raison sociale du pays", placeholder: "Ex. YATT & CO ENERGY TOGO SA" },
  { key: "address", label: "Adresse", placeholder: "Ex. Lomé - TOGO" },
  { key: "phone", label: "Téléphone", placeholder: "Ex. +228 …" },
  { key: "email", label: "E-mail", placeholder: "Ex. contact@…" },
  { key: "tax_id", label: "N° IFU / identifiant fiscal", placeholder: "" },
  { key: "bank_details", label: "Coordonnées bancaires", placeholder: "Banque, IBAN / RIB" },
] as const;

type Key = (typeof FIELDS)[number]["key"];
type Form = Record<Key, string>;

const EMPTY: Form = { legal_name: "", address: "", phone: "", email: "", tax_id: "", bank_details: "" };

/** Identité légale de l'entité du pays actif, imprimée sur les rapports (en-tête et pied de page). */
export const CountryIdentityForm = ({ tenantId }: { tenantId: string }) => {
  const { country, countries } = useCountry();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!country) return;
    setForm({
      legal_name: country.legal_name ?? "",
      address: country.address ?? "",
      phone: country.phone ?? "",
      email: country.email ?? "",
      tax_id: country.tax_id ?? "",
      bank_details: country.bank_details ?? "",
    });
  }, [country]);

  if (!country) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_country_identity", {
        _tenant: tenantId,
        _country: country.id,
        _data: form,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["workspace-countries"] });
      toast.success(`Identité ${country.name} enregistrée`);
    } catch (e: unknown) {
      toast.error(`Enregistrement impossible : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-primary" />
          Identité légale — {country.flag} {country.name}
        </CardTitle>
        <CardDescription>
          Imprimée sur les rapports produits dans ce pays. Un champ vide reprend l'information de la société.
          {countries.length > 1 && " Changez de pays en haut de l'écran pour renseigner les autres entités."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`country-${f.key}`}>{f.label}</Label>
            <Input
              id={`country-${f.key}`}
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
