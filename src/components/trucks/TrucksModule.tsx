import { useState } from "react";
import { useTrucks, Truck, TruckInsert } from "@/hooks/useTrucks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Trash2, Pencil, Truck as TruckIcon, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const emptyForm = (): TruckInsert => ({
  driver_name: "",
  registration: "",
  nominal_capacity: 0,
  compartment_count: 1,
  compartments: [0],
  notes: "",
});

const validateTruck = (f: TruckInsert): string[] => {
  const errors: string[] = [];
  if (!f.driver_name.trim()) errors.push("Le nom du chauffeur est obligatoire.");
  if (!f.registration.trim()) errors.push("L'immatriculation est obligatoire.");
  if (f.nominal_capacity <= 0) errors.push("La capacité nominale doit être supérieure à 0.");
  if (f.compartment_count <= 0) errors.push("Le nombre de compartiments doit être supérieur à 0.");
  if (f.compartments.some((c) => c < 0)) errors.push("La capacité d'un compartiment ne peut pas être négative.");
  return errors;
};

export const TrucksModule = () => {
  const { trucks, loading, createTruck, updateTruck, deleteTruck } = useTrucks();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TruckInsert>(emptyForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Truck | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm());
    setErrors([]);
    setIsOpen(true);
  };

  const openEdit = (t: Truck) => {
    setEditingId(t.id);
    setFormData({
      driver_name: t.driver_name,
      registration: t.registration,
      nominal_capacity: t.nominal_capacity,
      compartment_count: t.compartment_count,
      compartments: t.compartments.length ? t.compartments : Array(t.compartment_count).fill(0),
      notes: t.notes || "",
    });
    setErrors([]);
    setIsOpen(true);
  };

  const handleCountChange = (count: number) => {
    const n = Math.max(0, Math.floor(count) || 0);
    setFormData((f) => {
      const next = [...f.compartments];
      if (n > next.length) {
        while (next.length < n) next.push(0);
      } else {
        next.length = n;
      }
      return { ...f, compartment_count: n, compartments: next };
    });
  };

  const handleCompartmentChange = (index: number, value: number) => {
    setFormData((f) => {
      const next = [...f.compartments];
      next[index] = value;
      return { ...f, compartments: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateTruck(formData);
    setErrors(v);
    if (v.length > 0) {
      toast.error("Veuillez corriger les erreurs du formulaire");
      return;
    }
    setSubmitting(true);
    const ok = editingId
      ? await updateTruck(editingId, formData)
      : await createTruck(formData);
    setSubmitting(false);
    if (ok) {
      setIsOpen(false);
      setFormData(emptyForm());
      setEditingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-semibold">Gestion des camions</h2>
          <p className="text-sm text-muted-foreground">
            Enregistrez vos camions, chauffeurs et compartiments pour les retrouver lors des dépotages
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setErrors([]); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nouveau camion
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TruckIcon className="w-5 h-5" />
                {editingId ? "Modifier le camion" : "Enregistrer un camion"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertTitle>Erreurs de saisie</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      {errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="driver_name">Nom du chauffeur</Label>
                  <Input
                    id="driver_name"
                    value={formData.driver_name}
                    onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                    placeholder="Ex: Jean Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration">Immatriculation</Label>
                  <Input
                    id="registration"
                    value={formData.registration}
                    onChange={(e) => setFormData({ ...formData, registration: e.target.value })}
                    placeholder="Ex: AB 1234 RB"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nominal_capacity">Capacité nominale (L)</Label>
                  <Input
                    id="nominal_capacity"
                    type="number"
                    min={0}
                    value={formData.nominal_capacity || ""}
                    onChange={(e) => setFormData({ ...formData, nominal_capacity: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compartment_count">Nombre de compartiments</Label>
                  <Input
                    id="compartment_count"
                    type="number"
                    min={1}
                    value={formData.compartment_count || ""}
                    onChange={(e) => handleCountChange(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Capacité de chaque compartiment (L)</Label>
                <div className="grid grid-cols-2 gap-3">
                  {formData.compartments.map((c, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Compartiment {i + 1}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={c || ""}
                        onChange={(e) => handleCompartmentChange(i, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
                {formData.compartments.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total compartiments : {formData.compartments.reduce((a, b) => a + b, 0).toLocaleString()} L
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optionnel)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingId ? "Enregistrer" : "Ajouter"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liste des camions ({trucks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {trucks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TruckIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun camion enregistré</p>
              <p className="text-sm">Cliquez sur « Nouveau camion » pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Immatriculation</TableHead>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead className="text-right">Cap. nominale</TableHead>
                    <TableHead className="text-right">Compartiments</TableHead>
                    <TableHead>Détail compartiments</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trucks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.registration}</TableCell>
                      <TableCell>{t.driver_name}</TableCell>
                      <TableCell className="text-right">{t.nominal_capacity.toLocaleString()} L</TableCell>
                      <TableCell className="text-right">{t.compartment_count}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.compartments.map((c, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              C{i + 1}: {c.toLocaleString()} L
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(t)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le camion</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le camion <strong>{deleting?.registration}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) await deleteTruck(deleting.id);
                setDeleting(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
