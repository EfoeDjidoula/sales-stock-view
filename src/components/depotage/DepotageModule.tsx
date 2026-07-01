import { useState, useMemo, useEffect } from "react";
import { useDepotages, DepotageInsert, ProductType } from "@/hooks/useDepotages";
import { useStations } from "@/hooks/useStations";
import { useTanks } from "@/hooks/useTanks";
import { useTrucks } from "@/hooks/useTrucks";
import { useTankLatestStock } from "@/hooks/useTankLatestStock";
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
import { Plus, Trash2, Loader2, Droplets, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const getProductLabel = (type: ProductType) => (type === "super" ? "Super" : "Gasoil");

const emptyForm = (): DepotageInsert => ({
  station_id: "",
  tank_id: null,
  truck_id: null,
  product_type: "super",
  truck_registration: "",
  truck_nominal_capacity: 0,
  tank_capacity_liters: 0,
  quantity_to_unload: 0,
  quantity_unloaded: 0,
  tolerance_rate: 0.5,
  ecart: 0,
  stock_before: 0,
  gauge_after: 0,
  stock_theoretical: 0,
  depotage_ecart: 0,
  start_time: "",
  end_time: "",
  depotage_date: new Date().toISOString().split("T")[0],
  notes: "",
});

// Seuil de tolérance en litres = quantité à dépoter * taux / 100
const toleranceLiters = (qty: number, rate: number) => (qty * rate) / 100;

const isWithinTolerance = (ecart: number, qty: number, rate: number) =>
  Math.abs(ecart) <= toleranceLiters(qty, rate);

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Renvoie l'heure (HH:MM) une minute après l'heure fournie, plafonnée à 23:59
const nextMinute = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = Math.min(h * 60 + m + 1, 23 * 60 + 59);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
};

// Capacité totale exploitable d'un camion (somme des compartiments si définis, sinon capacité nominale)
const truckUsableCapacity = (truck?: { nominal_capacity: number; compartments: number[] } | null): number => {
  if (!truck) return 0;
  const compartmentsTotal = Array.isArray(truck.compartments)
    ? truck.compartments.reduce((sum, c) => sum + (Number(c) || 0), 0)
    : 0;
  if (compartmentsTotal > 0) return compartmentsTotal;
  return truck.nominal_capacity || 0;
};

// Validation côté UI : renvoie la liste des messages d'erreur (vide si valide)
const validateDepotage = (
  f: DepotageInsert,
  truck?: { nominal_capacity: number; compartments: number[] } | null
): string[] => {
  const errors: string[] = [];

  if (!f.station_id) errors.push("Veuillez sélectionner une station.");
  if (!f.tank_id) errors.push("Veuillez sélectionner une cuve.");
  if (!f.truck_registration.trim()) errors.push("L'immatriculation du camion est obligatoire.");

  if (f.truck_nominal_capacity < 0) errors.push("La capacité nominale du camion ne peut pas être négative.");
  if (f.quantity_to_unload < 0) errors.push("La quantité à dépoter ne peut pas être négative.");
  if (f.quantity_unloaded < 0) errors.push("La quantité réellement dépotée ne peut pas être négative.");
  if (f.stock_before < 0) errors.push("Le stock précédent ne peut pas être négatif.");
  if (f.gauge_after < 0) errors.push("La jauge après dépotage ne peut pas être négative.");

  if (!f.tolerance_rate || f.tolerance_rate <= 0) {
    errors.push("Le taux de tolérance est obligatoire et doit être supérieur à 0.");
  }
  if (f.tolerance_rate > 100) {
    errors.push("Le taux de tolérance ne peut pas dépasser 100 %.");
  }

  if (f.quantity_to_unload <= 0) errors.push("La quantité à dépoter doit être supérieure à 0.");

  if (f.tank_capacity_liters > 0 && f.quantity_to_unload > f.tank_capacity_liters) {
    errors.push(
      `La quantité à dépoter (${fmt(f.quantity_to_unload)} L) dépasse la capacité de la cuve (${fmt(f.tank_capacity_liters)} L).`
    );
  }

  if (f.tank_capacity_liters > 0 && f.gauge_after > f.tank_capacity_liters) {
    errors.push(
      `La jauge après dépotage (${fmt(f.gauge_after)} L) dépasse la capacité de la cuve (${fmt(f.tank_capacity_liters)} L).`
    );
  }

  // Contrôles liés à la capacité des compartiments du camion sélectionné
  const truckCapacity = truckUsableCapacity(truck);
  if (truckCapacity > 0) {
    if (f.quantity_to_unload > truckCapacity) {
      errors.push(
        `La quantité à dépoter (${fmt(f.quantity_to_unload)} L) dépasse la capacité des compartiments du camion (${fmt(truckCapacity)} L).`
      );
    }
    if (f.quantity_unloaded > truckCapacity) {
      errors.push(
        `La quantité réellement dépotée (${fmt(f.quantity_unloaded)} L) dépasse la capacité des compartiments du camion (${fmt(truckCapacity)} L).`
      );
    }
    // La tolérance en litres doit rester cohérente avec la capacité du camion
    const tolLiters = toleranceLiters(f.quantity_to_unload, f.tolerance_rate);
    if (f.quantity_to_unload + tolLiters > truckCapacity) {
      errors.push(
        `La quantité à dépoter plus la tolérance (${fmt(f.quantity_to_unload + tolLiters)} L) dépasse la capacité du camion (${fmt(truckCapacity)} L).`
      );
    }
  }

  // Validation des horodatages
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (f.start_time && !timeRe.test(f.start_time)) {
    errors.push("L'heure de début est invalide.");
  }
  if (f.end_time && !timeRe.test(f.end_time)) {
    errors.push("L'heure de fin est invalide.");
  }
  if (f.end_time && !f.start_time) {
    errors.push("Veuillez renseigner l'heure de début avant l'heure de fin.");
  }
  if (
    f.start_time &&
    f.end_time &&
    timeRe.test(f.start_time) &&
    timeRe.test(f.end_time) &&
    f.end_time <= f.start_time
  ) {
    errors.push("L'heure de fin doit être strictement postérieure à l'heure de début.");
  }

  return errors;
};

export const DepotageModule = () => {
  const { depotages, loading, createDepotage, deleteDepotage } = useDepotages();
  const { stations, loading: stationsLoading } = useStations();
  const { trucks } = useTrucks();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<DepotageInsert>(emptyForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [gaugeAuto, setGaugeAuto] = useState(true);

  // Cuves de la station sélectionnée dans le formulaire
  const { tanks } = useTanks(formData.station_id || undefined);
  const filteredTanks = useMemo(
    () => tanks.filter((t) => t.product_type === formData.product_type),
    [tanks, formData.product_type]
  );

  // Stock précédent automatique de la cuve concernée
  const { stock: latestStock } = useTankLatestStock(
    formData.station_id || undefined,
    formData.tank_id,
    formData.product_type
  );

  useEffect(() => {
    if (latestStock != null) {
      setFormData((f) => ({ ...f, stock_before: latestStock }));
    }
  }, [latestStock]);

  // Recalcule en temps réel les champs dépendants (stock théorique, jauge, écart)
  useEffect(() => {
    setFormData((f) => {
      const theoretical = f.stock_before + f.quantity_unloaded;
      const nextGauge = gaugeAuto ? theoretical : f.gauge_after;
      return {
        ...f,
        ecart: f.quantity_unloaded - f.quantity_to_unload,
        stock_theoretical: theoretical,
        gauge_after: nextGauge,
        depotage_ecart: nextGauge - theoretical,
      };
    });
  }, [formData.stock_before, formData.quantity_unloaded, formData.quantity_to_unload, gaugeAuto]);

  const handleStationSelect = (stationId: string) => {
    setFormData((f) => ({ ...f, station_id: stationId, tank_id: null, tank_capacity_liters: 0, stock_before: 0 }));
  };

  const handleProductSelect = (product: ProductType) => {
    setFormData((f) => ({ ...f, product_type: product, tank_id: null, tank_capacity_liters: 0, stock_before: 0 }));
  };

  const handleTankSelect = (tankId: string) => {
    const tank = tanks.find((t) => t.id === tankId);
    setFormData((f) => ({
      ...f,
      tank_id: tankId,
      tank_capacity_liters: tank ? tank.capacity_liters : 0,
    }));
  };

  const handleTruckSelect = (truckId: string) => {
    const truck = trucks.find((t) => t.id === truckId);
    setFormData((f) => ({
      ...f,
      truck_id: truckId,
      truck_registration: truck ? truck.registration : f.truck_registration,
      truck_nominal_capacity: truck ? truck.nominal_capacity : f.truck_nominal_capacity,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTruck = trucks.find((t) => t.id === formData.truck_id) || null;
    const validationErrors = validateDepotage(formData, selectedTruck);
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      toast.error("Veuillez corriger les erreurs du formulaire");
      return;
    }
    const payload: DepotageInsert = {
      ...formData,
      start_time: formData.start_time || null,
      end_time: formData.end_time || null,
      ecart: formData.quantity_unloaded - formData.quantity_to_unload,
      stock_theoretical: formData.stock_before + formData.quantity_unloaded,
      depotage_ecart: formData.gauge_after - (formData.stock_before + formData.quantity_unloaded),
    };
    const result = await createDepotage(payload);
    if (result) {
      setIsOpen(false);
      setErrors([]);
      setGaugeAuto(true);
      setFormData(emptyForm());
    }
  };

  // Aperçu en direct dans le formulaire (alimenté par les champs auto-recalculés de formData)
  const previewEcart = formData.ecart;
  const previewSeuil = toleranceLiters(formData.quantity_to_unload, formData.tolerance_rate);
  const previewConforme = isWithinTolerance(previewEcart, formData.quantity_to_unload, formData.tolerance_rate);
  const previewTheoretical = formData.stock_theoretical;
  const previewDepotageEcart = formData.depotage_ecart;

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
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) { setErrors([]); setGaugeAuto(true); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nouveau dépotage
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5" />
                Enregistrer un dépotage
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
                    Capacité de la cuve : {formData.tank_capacity_liters.toLocaleString()} L · Stock précédent : {fmt(formData.stock_before)} L
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Camion</Label>
                <Select
                  value={formData.truck_id || ""}
                  onValueChange={handleTruckSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={trucks.length ? "Sélectionner un camion" : "Aucun camion enregistré"} />
                  </SelectTrigger>
                  <SelectContent>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.registration} — {t.driver_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    onChange={(e) => setFormData((f) => ({ ...f, quantity_to_unload: Number(e.target.value) }))}
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
                    onChange={(e) => setFormData((f) => ({ ...f, quantity_unloaded: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stock_before">Stock précédent cuve (L)</Label>
                  <Input
                    id="stock_before"
                    type="number"
                    min={0}
                    value={formData.stock_before || ""}
                    onChange={(e) => setFormData((f) => ({ ...f, stock_before: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="gauge_after">Jauge après dépotage (L)</Label>
                    {!gaugeAuto && (
                      <button
                        type="button"
                        onClick={() => setGaugeAuto(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        Revenir à la jauge théorique
                      </button>
                    )}
                  </div>
                  <Input
                    id="gauge_after"
                    type="number"
                    min={0}
                    value={formData.gauge_after || ""}
                    onChange={(e) => {
                      setGaugeAuto(false);
                      setFormData((f) => {
                        const value = Number(e.target.value);
                        return {
                          ...f,
                          gauge_after: value,
                          depotage_ecart: value - (f.stock_before + f.quantity_unloaded),
                        };
                      });
                    }}
                  />
                  {gaugeAuto && (
                    <p className="text-xs text-muted-foreground">
                      Valeur automatique = stock précédent + quantité dépotée. Modifiez ce champ pour saisir une jauge réelle.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_time">Heure début dépotage</Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={formData.start_time || ""}
                    onChange={(e) => {
                      const start = e.target.value;
                      setFormData((prev) => {
                        let end = prev.end_time;
                        // Si l'heure de fin n'est plus strictement postérieure, on l'ajuste
                        if (start && end && end <= start) {
                          end = nextMinute(start);
                        }
                        return { ...prev, start_time: start, end_time: end };
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">Heure fin dépotage</Label>
                  <Input
                    id="end_time"
                    type="time"
                    value={formData.end_time || ""}
                    min={formData.start_time || undefined}
                    disabled={!formData.start_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
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
                      <span className="text-muted-foreground">Stock précédent cuve :</span>
                      <span>{fmt(formData.stock_before)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stock théorique après dépotage :</span>
                      <span>{fmt(previewTheoretical)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Jauge après dépotage :</span>
                      <span>{fmt(formData.gauge_after)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Écart dépotage (jauge − théorique) :</span>
                      <span className={previewDepotageEcart === 0 ? "" : "text-destructive"}>
                        {previewDepotageEcart > 0 ? "+" : ""}
                        {fmt(previewDepotageEcart)} L
                      </span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between">
                      <span className="text-muted-foreground">Seuil de tolérance :</span>
                      <span>± {fmt(previewSeuil)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Écart (réel − à dépoter) :</span>
                      <span className={previewEcart === 0 ? "" : previewConforme ? "text-emerald-500" : "text-destructive"}>
                        {previewEcart > 0 ? "+" : ""}
                        {fmt(previewEcart)} L
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
                    <TableHead className="text-right">À dépoter</TableHead>
                    <TableHead className="text-right">Dépotée</TableHead>
                    <TableHead className="text-right">Stock préc.</TableHead>
                    <TableHead className="text-right">Théorique</TableHead>
                    <TableHead className="text-right">Jauge après</TableHead>
                    <TableHead className="text-right">Écart dépot.</TableHead>
                    <TableHead>Horaires</TableHead>
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
                        <TableCell className="text-right">{fmt(d.quantity_to_unload)} L</TableCell>
                        <TableCell className="text-right">{fmt(d.quantity_unloaded)} L</TableCell>
                        <TableCell className="text-right">{fmt(d.stock_before)} L</TableCell>
                        <TableCell className="text-right">{fmt(d.stock_theoretical)} L</TableCell>
                        <TableCell className="text-right">{fmt(d.gauge_after)} L</TableCell>
                        <TableCell className={`text-right font-semibold ${d.depotage_ecart === 0 ? "" : "text-destructive"}`}>
                          {d.depotage_ecart > 0 ? "+" : ""}
                          {fmt(d.depotage_ecart)} L
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {d.start_time ? d.start_time.slice(0, 5) : "—"} → {d.end_time ? d.end_time.slice(0, 5) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${d.ecart === 0 ? "" : conforme ? "text-emerald-500" : "text-destructive"}`}>
                          {d.ecart > 0 ? "+" : ""}
                          {fmt(d.ecart)} L
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
