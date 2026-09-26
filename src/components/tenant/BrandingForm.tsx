import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Save, FileSearch, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildBrandingPreviewPdf } from "@/lib/brandingPreviewPdf";
import type { jsPDF } from "jspdf";
import { toast } from "sonner";

interface BrandingState {
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  app_title: string;
  app_description: string;
  footer_note: string;
  show_powered_by: boolean;
  powered_by_label: string;
}

const EMPTY: BrandingState = {
  logo_url: "",
  favicon_url: "",
  primary_color: "38 92% 50%",
  secondary_color: "25 95% 53%",
  app_title: "",
  app_description: "",
  footer_note: "",
  show_powered_by: true,
  powered_by_label: "Powered by LUMATEK TECHNOLOGY",
};

/**
 * Identité visuelle white label d'une société.
 * Chaque enregistrement est isolé par tenant : aucune incidence sur les autres clients.
 */
export const BrandingForm = ({ tenantId }: { tenantId: string }) => {
  const queryClient = useQueryClient();
  const { isPlatformAdmin } = usePlatformAdmin();
  const [form, setForm] = useState<BrandingState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; doc: jsPDF; logoWarning: boolean } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const companyName = data?.legal_name || data?.trade_name || data?.name || "Société";

  const openPreview = async () => {
    setPreviewing(true);
    try {
      const { doc, logoWarning } = await buildBrandingPreviewPdf({
        companyName,
        logoUrl: form.logo_url.trim() || null,
        primaryColor: form.primary_color,
        secondaryColor: form.secondary_color,
        address: data?.address ?? null,
        phone: data?.phone ?? null,
        email: data?.email ?? null,
        website: data?.website ?? null,
        taxId: data?.tax_id ?? null,
        footerNote: form.footer_note.trim() || null,
        poweredBy: form.show_powered_by ? form.powered_by_label.trim() || null : null,
      });
      const url = URL.createObjectURL(doc.output("blob"));
      setPreview({ url, doc, logoWarning });
    } catch {
      toast.error("Impossible de générer l'aperçu");
    } finally {
      setPreviewing(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-branding", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(
          "name, legal_name, trade_name, address, phone, email, website, tax_id, logo_url, favicon_url, primary_color, secondary_color, app_title, app_description, footer_note, show_powered_by, powered_by_label"
        )
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      logo_url: data.logo_url ?? "",
      favicon_url: data.favicon_url ?? "",
      primary_color: data.primary_color ?? EMPTY.primary_color,
      secondary_color: data.secondary_color ?? EMPTY.secondary_color,
      app_title: data.app_title ?? "",
      app_description: data.app_description ?? "",
      footer_note: data.footer_note ?? "",
      show_powered_by: data.show_powered_by ?? true,
      powered_by_label: data.powered_by_label ?? EMPTY.powered_by_label,
    });
  }, [data]);

  const set =
    (key: keyof BrandingState) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          logo_url: form.logo_url.trim() || null,
          favicon_url: form.favicon_url.trim() || null,
          primary_color: form.primary_color.trim() || EMPTY.primary_color,
          secondary_color: form.secondary_color.trim() || EMPTY.secondary_color,
          app_title: form.app_title.trim() || null,
          app_description: form.app_description.trim() || null,
          footer_note: form.footer_note.trim() || null,
          show_powered_by: form.show_powered_by,
          powered_by_label:
            form.powered_by_label.trim() || EMPTY.powered_by_label,
        })
        .eq("id", tenantId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["tenant-branding", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["lumatek-tenants"] });
      toast.success("Identité visuelle enregistrée");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      toast.error(`Enregistrement impossible : ${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Identité visuelle
        </CardTitle>
        <CardDescription>
          Logo, favicon, couleurs et mentions affichés dans l'application, les
          rapports et les documents PDF de cette société uniquement.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brand-logo">URL du logo</Label>
          <div className="flex items-center gap-2">
            <Input id="brand-logo" value={form.logo_url} onChange={set("logo_url")} placeholder="https://..." />
            {form.logo_url ? (
              <img src={form.logo_url} alt="Aperçu du logo" className="h-9 w-9 object-contain rounded-md border border-border" />
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand-favicon">URL du favicon</Label>
          <div className="flex items-center gap-2">
            <Input id="brand-favicon" value={form.favicon_url} onChange={set("favicon_url")} placeholder="https://..." />
            {form.favicon_url ? (
              <img src={form.favicon_url} alt="Aperçu du favicon" className="h-9 w-9 object-contain rounded-md border border-border" />
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-primary">Couleur principale (HSL)</Label>
          <div className="flex items-center gap-2">
            <Input id="brand-primary" value={form.primary_color} onChange={set("primary_color")} placeholder="38 92% 50%" />
            <span className="h-9 w-9 rounded-md border border-border shrink-0" style={{ background: `hsl(${form.primary_color})` }} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand-secondary">Couleur secondaire (HSL)</Label>
          <div className="flex items-center gap-2">
            <Input id="brand-secondary" value={form.secondary_color} onChange={set("secondary_color")} placeholder="25 95% 53%" />
            <span className="h-9 w-9 rounded-md border border-border shrink-0" style={{ background: `hsl(${form.secondary_color})` }} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-title">Titre de l'application</Label>
          <Input id="brand-title" value={form.app_title} onChange={set("app_title")} placeholder="Nom affiché dans l'onglet du navigateur" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brand-desc">Description</Label>
          <Input id="brand-desc" value={form.app_description} onChange={set("app_description")} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="brand-footer">Mention de bas de page</Label>
          <Input id="brand-footer" value={form.footer_note} onChange={set("footer_note")} placeholder="Ex : Tous droits réservés" />
        </div>

        <div className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="brand-powered">Mention « Powered by LUMATEK »</Label>
              <p className="text-xs text-muted-foreground">
                Mention discrète affichée en bas de l'application et des documents.
              </p>
            </div>
            <Switch
              id="brand-powered"
              checked={form.show_powered_by}
              disabled={!isPlatformAdmin}
              onCheckedChange={(v) => setForm((f) => ({ ...f, show_powered_by: v }))}
            />
          </div>
          <Input
            value={form.powered_by_label}
            onChange={set("powered_by_label")}
            disabled={!isPlatformAdmin || !form.show_powered_by}
          />
          {!isPlatformAdmin && (
            <p className="text-xs text-muted-foreground">
              Seul l'administrateur de la plateforme peut modifier cette mention.
            </p>
          )}
        </div>

        <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={openPreview} disabled={previewing} className="gap-2">
            {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
            Aperçu du rapport PDF
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Aperçu du rapport PDF</DialogTitle>
            <DialogDescription>
              Vérifiez le logo, les couleurs et les coordonnées de {companyName} avant de télécharger.
              Les modifications non enregistrées sont incluses.
            </DialogDescription>
          </DialogHeader>
          {preview?.logoWarning && (
            <p role="alert" className="text-sm text-destructive">Le logo n'a pas pu être chargé depuis l'adresse indiquée.</p>
          )}
          {preview && <iframe title="Aperçu PDF" src={preview.url} className="w-full h-[65vh] rounded-md border border-border bg-muted" />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Fermer</Button>
            <Button className="gap-2" onClick={() => preview?.doc.save(`Apercu_identite_${companyName.replace(/\s+/g, "_")}.pdf`)}>
              <Download className="w-4 h-4" /> Télécharger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
