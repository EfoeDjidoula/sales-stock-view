import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { IndexEntry } from "@/hooks/useIndexEntries";
import { Save, Loader2 } from "lucide-react";

interface EditEntryDialogProps {
  entry: IndexEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditEntryDialog = ({ entry, open, onOpenChange }: EditEntryDialogProps) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    super1_index_depart: 0,
    super1_index_arrivee: 0,
    super1_jauge: 0,
    super2_index_depart: 0,
    super2_index_arrivee: 0,
    super2_jauge: 0,
    gasoil1_index_depart: 0,
    gasoil1_index_arrivee: 0,
    gasoil1_jauge: 0,
    gasoil2_index_depart: 0,
    gasoil2_index_arrivee: 0,
    gasoil2_jauge: 0,
    versement_momo: 0,
    versement_momo_ref: "",
    versement_banque: 0,
    versement_banque_ref: "",
    versement_liquidite: 0,
    versement_liquidite_note: "",
    bons_carburant_nombre: 0,
    bons_carburant_valeur: 0,
    bons_entreprise_nombre: 0,
    bons_entreprise_valeur: 0,
  });

  useEffect(() => {
    if (entry) {
      setForm({
        super1_index_depart: entry.super1_index_depart,
        super1_index_arrivee: entry.super1_index_arrivee,
        super1_jauge: entry.super1_jauge,
        super2_index_depart: entry.super2_index_depart,
        super2_index_arrivee: entry.super2_index_arrivee,
        super2_jauge: entry.super2_jauge,
        gasoil1_index_depart: entry.gasoil1_index_depart,
        gasoil1_index_arrivee: entry.gasoil1_index_arrivee,
        gasoil1_jauge: entry.gasoil1_jauge,
        gasoil2_index_depart: entry.gasoil2_index_depart,
        gasoil2_index_arrivee: entry.gasoil2_index_arrivee,
        gasoil2_jauge: entry.gasoil2_jauge,
        versement_momo: entry.versement_momo,
        versement_momo_ref: entry.versement_momo_ref || "",
        versement_banque: entry.versement_banque,
        versement_banque_ref: entry.versement_banque_ref || "",
        versement_liquidite: entry.versement_liquidite,
        versement_liquidite_note: entry.versement_liquidite_note || "",
        bons_carburant_nombre: entry.bons_carburant_nombre,
        bons_carburant_valeur: entry.bons_carburant_valeur,
        bons_entreprise_nombre: entry.bons_entreprise_nombre,
        bons_entreprise_valeur: entry.bons_entreprise_valeur,
      });
    }
  }, [entry]);

  const updateField = (field: string, value: string) => {
    const numFields = [
      "super1_index_depart", "super1_index_arrivee", "super1_jauge",
      "super2_index_depart", "super2_index_arrivee", "super2_jauge",
      "gasoil1_index_depart", "gasoil1_index_arrivee", "gasoil1_jauge",
      "gasoil2_index_depart", "gasoil2_index_arrivee", "gasoil2_jauge",
      "versement_momo", "versement_banque", "versement_liquidite",
      "bons_carburant_nombre", "bons_carburant_valeur",
      "bons_entreprise_nombre", "bons_entreprise_valeur",
    ];
    if (numFields.includes(field)) {
      const num = parseFloat(value) || 0;
      setForm(prev => ({ ...prev, [field]: Math.max(0, num) }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const hasValidationErrors = () => {
    const numericFields = [
      "super1_index_depart", "super1_index_arrivee", "super1_jauge",
      "super2_index_depart", "super2_index_arrivee", "super2_jauge",
      "gasoil1_index_depart", "gasoil1_index_arrivee", "gasoil1_jauge",
      "gasoil2_index_depart", "gasoil2_index_arrivee", "gasoil2_jauge",
      "versement_momo", "versement_banque", "versement_liquidite",
      "bons_carburant_nombre", "bons_carburant_valeur",
      "bons_entreprise_nombre", "bons_entreprise_valeur",
    ];
    return numericFields.some(f => (form as any)[f] < 0);
  };

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("index_entries")
        .update(form)
        .eq("id", entry.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
      queryClient.invalidateQueries({ queryKey: ["latest-jauge"] });
      toast.success("Saisie modifiée avec succès");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erreur lors de la modification", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, field, type = "number" }: { label: string; field: string; type?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={(form as any)[field]}
        onChange={e => updateField(field, e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Modifier la saisie — {entry?.stations?.name} — {entry?.entry_date && new Date(entry.entry_date).toLocaleDateString("fr-FR")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Super */}
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Super 1</h4>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Index Départ" field="super1_index_depart" />
              <Field label="Index Arrivée" field="super1_index_arrivee" />
              <Field label="Jauge" field="super1_jauge" />
            </div>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Super 2</h4>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Index Départ" field="super2_index_depart" />
              <Field label="Index Arrivée" field="super2_index_arrivee" />
              <Field label="Jauge" field="super2_jauge" />
            </div>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Gasoil 1</h4>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Index Départ" field="gasoil1_index_depart" />
              <Field label="Index Arrivée" field="gasoil1_index_arrivee" />
              <Field label="Jauge" field="gasoil1_jauge" />
            </div>
          </div>
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Gasoil 2</h4>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Index Départ" field="gasoil2_index_depart" />
              <Field label="Index Arrivée" field="gasoil2_index_arrivee" />
              <Field label="Jauge" field="gasoil2_jauge" />
            </div>
          </div>

          {/* Versements */}
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Versements</h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="MOMO (FCFA)" field="versement_momo" />
              <Field label="Réf. MOMO" field="versement_momo_ref" type="text" />
              <Field label="Banque (FCFA)" field="versement_banque" />
              <Field label="Réf. Banque" field="versement_banque_ref" type="text" />
              <Field label="Liquidité (FCFA)" field="versement_liquidite" />
              <Field label="Note liquidité" field="versement_liquidite_note" type="text" />
            </div>
          </div>

          {/* Bons */}
          <div>
            <h4 className="font-medium text-sm mb-2 text-primary">Bons</h4>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Bons carburant (nb)" field="bons_carburant_nombre" />
              <Field label="Valeur (FCFA)" field="bons_carburant_valeur" />
              <Field label="Bons entreprise (nb)" field="bons_entreprise_nombre" />
              <Field label="Valeur (FCFA)" field="bons_entreprise_valeur" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
