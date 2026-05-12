import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Pump } from "@/hooks/usePumps";
import type { Tank } from "@/hooks/useTanks";

interface PumpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationId: string;
  pump: Pump | null;
  tanks: Tank[];
  onSaved: () => void;
}

const NONE = "__none__";

export const PumpDialog = ({ open, onOpenChange, stationId, pump, tanks, onSaved }: PumpDialogProps) => {
  const [name, setName] = useState("");
  const [productType, setProductType] = useState<"super" | "gasoil">("super");
  const [tankId, setTankId] = useState<string>(NONE);
  const [position, setPosition] = useState<string>("0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(pump?.name ?? "");
      setProductType((pump?.product_type as "super" | "gasoil") ?? "super");
      setTankId(pump?.tank_id ?? NONE);
      setPosition(String(pump?.position ?? 0));
    }
  }, [open, pump]);

  const filteredTanks = useMemo(
    () => tanks.filter((t) => t.product_type === productType),
    [tanks, productType]
  );

  // If product changes and the selected tank no longer matches, reset it
  useEffect(() => {
    if (tankId !== NONE && !filteredTanks.find((t) => t.id === tankId)) {
      setTankId(NONE);
    }
  }, [productType, filteredTanks, tankId]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error("Le nom est requis");
    const pos = Number(position);

    setSubmitting(true);
    try {
      const payload = {
        station_id: stationId,
        name: trimmedName,
        product_type: productType,
        tank_id: tankId === NONE ? null : tankId,
        position: Number.isFinite(pos) ? pos : 0,
      };
      if (pump) {
        const { error } = await supabase.from("pumps").update(payload).eq("id", pump.id);
        if (error) throw error;
        toast.success("Pompe modifiée");
      } else {
        const { error } = await supabase.from("pumps").insert(payload);
        if (error) throw error;
        toast.success("Pompe ajoutée");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>{pump ? "Modifier la pompe" : "Ajouter une pompe"}</DialogTitle>
          <DialogDescription>Définissez le produit et la cuve liée.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pump-name">Nom</Label>
            <Input id="pump-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pompe Super 1" maxLength={100} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Produit</Label>
              <Select value={productType} onValueChange={(v) => setProductType(v as "super" | "gasoil")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super">Super</SelectItem>
                  <SelectItem value="gasoil">Gasoil</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pump-pos">Position</Label>
              <Input id="pump-pos" type="number" min={0} value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cuve liée</Label>
            <Select value={tankId} onValueChange={setTankId}>
              <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {filteredTanks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.capacity_liters.toLocaleString("fr-FR")} L
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredTanks.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucune cuve {productType} disponible pour cette station.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {pump ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
