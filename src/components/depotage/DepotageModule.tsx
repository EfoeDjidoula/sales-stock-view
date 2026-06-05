import { useState, useMemo } from "react";
import { useDepotages, DepotageInsert, ProductType } from "@/hooks/useDepotages";
import { useStations } from "@/hooks/useStations";
import { useTanks } from "@/hooks/useTanks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Trash2, Truck, Loader2, Droplets, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const getProductLabel = (type: ProductType) => (type === "super" ? "Super" : "Gasoil");

const emptyForm = (): DepotageInsert => ({
  station_id: "",
  tank_id: null,
  product_type: "super",
  truck_registration: "",
  truck_nominal_capacity: 0,
  tank_capacity_liters: 0,
  quantity_to_unload: 0,
  quantity_unloaded: 0,
  tolerance_rate: 0.5,
  depotage_date: new Date().toISOString().split("T")[0],
  notes: "",
});

// Seuil de tolérance en litres = quantité à dépoter * taux / 100
const toleranceLiters = (qty: number, rate: number) => (qty * rate) / 100;

const isWithinTolerance = (ecart: number, qty: number, rate: number) =>
  Math.abs(ecart) <= toleranceLiters(qty, rate);

// Validation côté UI : renvoie la liste des messages d'erreur (vide si valide)
const validateDepotage = (f: DepotageInsert): string[] => {
  const errors: string[] = [];

  if (!f.station_id) errors.push("Veuillez sélectionner une station.");
  if (!f.tank_id) errors.push("Veuillez sélectionner une cuve.");
  if (!f.truck_registration.trim()) errors.push("L'immatriculation du camion est obligatoire.");

  if (f.truck_nominal_capacity < 0) errors.push("La capacité nominale du camion ne peut pas être négative.");
  if (f.quantity_to_unload < 0) errors.push("La quantité à dépoter ne peut pas être négative.");
  if (f.quantity_unloaded < 0) errors.push("La quantité réellement dépotée ne peut pas être négative.");

  if (!f.tolerance_rate || f.tolerance_rate <= 0) {
    errors.push("Le taux de tolérance est obligatoire et doit être supérieur à 0.");
  }

  if (f.quantity_to_unload <= 0) errors.push("La quantité à dépoter doit être supérieure à 0.");

  if (f.tank_capacity_liters > 0 && f.quantity_to_unload > f.tank_capacity_liters) {
    errors.push(
      `La quantité à dépoter (${f.quantity_to_unload.toLocaleString()} L) dépasse la capacité de la cuve (${f.tank_capacity_liters.toLocaleString()} L).`
    );
  }

  if (f.tank_capacity_liters > 0 && f.quantity_unloaded > f.tank_capacity_liters) {
    errors.push(
      `La quantité réellement dépotée (${f.quantity_unloaded.toLocaleString()} L) dépasse la capacité de la cuve (${f.tank_capacity_liters.toLocaleString()} L).`
    );
  }

  return errors;
};

export const DepotageModule = () => {
  const { depotages, loading, createDepotage, deleteDepotage } = useDepotages();
  const { stations, loading: stationsLoading } = useStations();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<DepotageInsert>(emptyForm());
  const [errors, setErrors] = useState<string[]>([]);

  // Cuves de la station sélectionnée dans le formulaire
  const { tanks } = useTanks(formData.station_id || undefined);
  const filteredTanks = useMemo(
    () => tanks.filter((t) => t.product_type === formData.product_type),
    [tanks, formData.product_type]
  );

  const handleStationSelect = (stationId: string) => {
    setFormData((f) => ({ ...f, station_id: stationId, tank_id: null, tank_capacity_liters: 0 }));
  };

  const handleProductSelect = (product: ProductType) => {
    setFormData((f) => ({ ...f, product_type: product, tank_id: null, tank_capacity_liters: 0 }));
  };

  const handleTankSelect = (tankId: string) => {
    const tank = tanks.find((t) => t.id === tankId);
    setFormData((f) => ({
      ...f,
      tank_id: tankId,
      // Copie de la capacité de la cuve installée sur la station
      tank_capacity_liters: tank ? tank.capacity_liters : 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateDepotage(formData);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      toast.error("Veuillez corriger les erreurs du formulaire");
      return;
    }
    const result = await createDepotage(formData);
    if (result) {
      setIsOpen(false);
      setErrors([]);
      setFormData(emptyForm());
    }
  };

  // Aperçu en direct dans le formulaire
  const previewEcart = formData.quantity_unloaded - formData.quantity_to_unload;
  const previewSeuil = toleranceLiters(formData.quantity_to_unload, formData.tolerance_rate);
  const previewConforme = isWithinTolerance(previewEcart, formData.quantity_to_unload, formData.tolerance_rate);

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
          <h2 className="text-xl font-display font-semibold">Gestion des dépotages</h2>
          <p className="text-sm text-muted-foreground">
            Suivez les dépotages des camions, la tolérance appliquée et les écarts par cuve
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nouveau dépotage
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5" />
                Enregistrer un dépotage
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Station</Label>
                  <Select value={formData.station_id} onValueChange={handleStationSelect} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Produit</Label>
                  <Select value={formData.product_type} onValueChange={(v) => handleProductSelect(v as ProductType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super">Super</SelectItem>
                      <SelectItem value="gasoil">Gasoil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cuve concernée</Label>
                <Select
                  value={formData.tank_id || ""}
                  onValueChange={handleTankSelect}
                  disabled={!formData.station_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formData.station_id ? "Sélectionner une cuve" : "Choisir une station d'abord"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTanks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {t.capacity_liters.toLocaleString()} L
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.tank_id && (
                  <p className="text-xs text-muted-foreground">
                    Capacité de la cuve : {formData.tank_capacity_liters.toLocaleString()} L
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="truck_registration">Immatriculation camion</Label>
                  <Input
                    id="truck_registration"
                    value={formData.truck_registration}
                    onChange={(e) => setFormData({ ...formData, truck_registration: e.target.value })}
                    placeholder="Ex: AB 1234 RB"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="truck_nominal_capacity">Capacité nominale camion (L)</Label>
                  <Input
                    id="truck_nominal_capacity"
                    type="number"
                    min={0}
                    value={formData.truck_nominal_capacity || ""}
                    onChange={(e) => setFormData({ ...formData, truck_nominal_capacity: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity_to_unload">Quantité à dépoter (L)</Label>
                  <Input
                    id="quantity_to_unload"
                    type="number"
                    min={0}
                    value={formData.quantity_to_unload || ""}
                    onChange={(e) => setFormData({ ...formData, quantity_to_unload: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity_unloaded">Quantité réellement dépotée (L)</Label>
                  <Input
                    id="quantity_unloaded"
                    type="number"
                    min={0}
                    value={formData.quantity_unloaded || ""}
                    onChange={(e) => setFormData({ ...formData, quantity_unloaded: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tolerance_rate">Taux de tolérance (%)</Label>
                  <Input
                    id="tolerance_rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.tolerance_rate || ""}
                    onChange={(e) => setFormData({ ...formData, tolerance_rate: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depotage_date">Date du dépotage</Label>
                  <Input
                    id="depotage_date"
                    type="date"
                    value={formData.depotage_date}
                    onChange={(e) => setFormData({ ...formData, depotage_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {formData.quantity_to_unload > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Seuil de tolérance :</span>
                      <span>± {previewSeuil.toLocaleString(undefined, { maximumFractionDigits: 2 })} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Écart (réel − à dépoter) :</span>
                      <span className={previewEcart === 0 ? "" : previewConforme ? "text-emerald-500" : "text-destructive"}>
                        {previewEcart > 0 ? "+" : ""}
                        {previewEcart.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Statut :</span>
                      {previewConforme ? (
                        <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conforme
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" /> Hors tolérance
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

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
                <Button type="submit" disabled={stationsLoading || !formData.station_id}>
                  Enregistrer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des dépotages</CardTitle>
        </CardHeader>
        <CardContent>
          {depotages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Droplets className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun dépotage enregistré</p>
              <p className="text-sm">Cliquez sur « Nouveau dépotage » pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead>Cuve</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Immat. camion</TableHead>
                    <TableHead className="text-right">Cap. nominale</TableHead>
                    <TableHead className="text-right">À dépoter</TableHead>
                    <TableHead className="text-right">Dépotée</TableHead>
                    <TableHead className="text-right">Tolérance</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depotages.map((d) => {
                    const conforme = isWithinTolerance(d.ecart, d.quantity_to_unload, d.tolerance_rate);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>{format(new Date(d.depotage_date), "dd MMM yyyy", { locale: fr })}</TableCell>
                        <TableCell>{d.station?.name || "-"}</TableCell>
                        <TableCell>{d.tank?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={d.product_type === "super" ? "default" : "secondary"}
                            className={d.product_type === "super" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"}
                          >
                            {getProductLabel(d.product_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{d.truck_registration}</TableCell>
                        <TableCell className="text-right">{d.truck_nominal_capacity.toLocaleString()} L</TableCell>
                        <TableCell className="text-right">{d.quantity_to_unload.toLocaleString()} L</TableCell>
                        <TableCell className="text-right">{d.quantity_unloaded.toLocaleString()} L</TableCell>
                        <TableCell className="text-right">{d.tolerance_rate}%</TableCell>
                        <TableCell className={`text-right font-semibold ${d.ecart === 0 ? "" : conforme ? "text-emerald-500" : "text-destructive"}`}>
                          {d.ecart > 0 ? "+" : ""}
                          {d.ecart.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                        </TableCell>
                        <TableCell>
                          {conforme ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Conforme
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="w-3 h-3" /> Hors tolérance
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteDepotage(d.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
