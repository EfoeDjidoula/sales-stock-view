import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tank } from "@/hooks/useTanks";

interface TankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stationId: string;
  tank: Tank | null;
  onSaved: () => void;
}

export const TankDialog = ({ open, onOpenChange, stationId, tank, onSaved }: TankDialogProps) => {
  const [name, setName] = useState("");
  const [productType, setProductType] = useState<"super" | "gasoil">("super");
  const [capacity, setCapacity] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(tank?.name ?? "");
      setProductType((tank?.product_type as "super" | "gasoil") ?? "super");
      setCapacity(tank?.capacity_liters != null ? String(tank.capacity_liters) : "");
      setNotes(tank?.notes ?? "");
    }
  }, [open, tank]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const cap = Number(capacity);
    if (!trimmedName) return toast.error("Le nom est requis");
    if (!Number.isFinite(cap) || cap <= 0) return toast.error("Capacité invalide (> 0)");

    setSubmitting(true);
    try {
      if (tank) {
        const { error } = await supabase
          .from("tanks")
          .update({ name: trimmedName, product_type: productType, capacity_liters: cap, notes: notes || null })
          .eq("id", tank.id);
        if (error) throw error;
        toast.success("Cuve modifiée");
      } else {
        const { error } = await supabase
          .from("tanks")
          .insert({ station_id: stationId, name: trimmedName, product_type: productType, capacity_liters: cap, notes: notes || null });
        if (error) throw error;
        toast.success("Cuve ajoutée");
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
          <DialogTitle>{tank ? "Modifier la cuve" : "Ajouter une cuve"}</DialogTitle>
          <DialogDescription>Renseignez le produit et la capacité réelle.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tank-name">Nom</Label>
            <Input id="tank-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Cuve Super 1" maxLength={100} />
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
              <Label htmlFor="tank-cap">Capacité réelle (L)</Label>
              <Input id="tank-cap" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tank-notes">Notes (optionnel)</Label>
            <Textarea id="tank-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {tank ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
