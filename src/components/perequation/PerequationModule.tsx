import { useState, useMemo } from "react";
import { usePerequation, ProductType } from "@/hooks/usePerequation";
import { useStations } from "@/hooks/useStations";
import { useSupplies } from "@/hooks/useSupplies";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, MapPin, Coins, Truck, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 }).format(v);

export const PerequationModule = () => {
  const { zones, rates, entries, loading, createZone, deleteZone, createRate, deleteRate, createEntry, updateEntryStatus, deleteEntry } = usePerequation();
  const { stations } = useStations();
  const { supplies } = useSupplies();
  const { currentUserRole } = useUserRoles();

  const canEdit = currentUserRole === "admin" || currentUserRole === "manager";
  const canDelete = currentUserRole === "admin";

  // Zone dialog
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneDesc, setZoneDesc] = useState("");

  // Rate dialog
  const [rateOpen, setRateOpen] = useState(false);
  const [rateForm, setRateForm] = useState({ zone_id: "", product_type: "super" as ProductType, rate_per_liter: 0, effective_from: new Date().toISOString().split("T")[0] });

  // Entry dialog
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({
    station_id: "",
    supply_id: "none",
    zone_id: "none",
    product_type: "super" as ProductType,
    quantity_liters: 0,
    delivery_date: new Date().toISOString().split("T")[0],
    bl_number: "",
    rate_per_liter: 0,
    notes: "",
  });

  const stationsMap = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const zonesMap = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // Auto-fill rate when zone+product change
  const findRate = (zone_id: string, product: ProductType) => {
    const matches = rates.filter((r) => r.zone_id === zone_id && r.product_type === product);
    return matches.length ? matches[0].rate_per_liter : 0;
  };

  // Auto-fill from supply selection
  const onSupplyChange = (supply_id: string) => {
    if (supply_id === "none") {
      setEntryForm((f) => ({ ...f, supply_id: "none" }));
      return;
    }
    const s = supplies.find((x) => x.id === supply_id);
    if (!s) return;
    const station = stationsMap.get(s.station_id);
    const zone_id = (station as any)?.zone_id || entryForm.zone_id;
    const rate = zone_id !== "none" ? findRate(zone_id, s.product_type as ProductType) : 0;
    setEntryForm({
      ...entryForm,
      supply_id,
      station_id: s.station_id,
      product_type: s.product_type as ProductType,
      quantity_liters: Number(s.quantity_received) || 0,
      delivery_date: s.reception_date,
      zone_id: zone_id || "none",
      rate_per_liter: rate,
    });
  };

  const totalAmount = entryForm.quantity_liters * entryForm.rate_per_liter;

  const stats = useMemo(() => {
    const total = entries.reduce((s, e) => s + Number(e.total_amount), 0);
    const pending = entries.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.total_amount), 0);
    const received = entries.filter((e) => e.status === "received").reduce((s, e) => s + Number(e.total_amount), 0);
    return { total, pending, received };
  }, [entries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="w-4 h-4" /> Total péréquation
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(stats.total)}</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> À recouvrer
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-500">{formatCurrency(stats.pending)}</p></CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Reçu
            </CardTitle>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-500">{formatCurrency(stats.received)}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="entries"><Truck className="w-4 h-4 mr-2" />Entrées</TabsTrigger>
          <TabsTrigger value="rates"><Coins className="w-4 h-4 mr-2" />Taux par zone</TabsTrigger>
          <TabsTrigger value="zones"><MapPin className="w-4 h-4 mr-2" />Zones</TabsTrigger>
        </TabsList>

        {/* === Entrées === */}
        <TabsContent value="entries">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Entrées de péréquation transport</CardTitle>
              {canEdit && (
                <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2"><Plus className="w-4 h-4" />Nouvelle entrée</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Nouvelle entrée péréquation</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                      <div className="md:col-span-2">
                        <Label>Approvisionnement lié (optionnel)</Label>
                        <Select value={entryForm.supply_id} onValueChange={onSupplyChange}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucun (saisie manuelle)</SelectItem>
                            {supplies.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {format(new Date(s.reception_date), "dd/MM/yy")} – {stationsMap.get(s.station_id)?.name} – {s.product_type} – {Number(s.quantity_received).toLocaleString()} L
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Station *</Label>
                        <Select value={entryForm.station_id} onValueChange={(v) => setEntryForm({ ...entryForm, station_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                          <SelectContent>
                            {stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Zone</Label>
                        <Select value={entryForm.zone_id} onValueChange={(v) => {
                          const r = v !== "none" ? findRate(v, entryForm.product_type) : 0;
                          setEntryForm({ ...entryForm, zone_id: v, rate_per_liter: r || entryForm.rate_per_liter });
                        }}>
                          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Aucune —</SelectItem>
                            {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Produit *</Label>
                        <Select value={entryForm.product_type} onValueChange={(v: ProductType) => {
                          const r = entryForm.zone_id !== "none" ? findRate(entryForm.zone_id, v) : 0;
                          setEntryForm({ ...entryForm, product_type: v, rate_per_liter: r || entryForm.rate_per_liter });
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super">Super</SelectItem>
                            <SelectItem value="gasoil">Gasoil</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantité (L) *</Label>
                        <Input type="number" min="0" value={entryForm.quantity_liters} onChange={(e) => setEntryForm({ ...entryForm, quantity_liters: Math.max(0, Number(e.target.value)) })} />
                      </div>
                      <div>
                        <Label>Date livraison *</Label>
                        <Input type="date" value={entryForm.delivery_date} onChange={(e) => setEntryForm({ ...entryForm, delivery_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>N° BL / Facture</Label>
                        <Input value={entryForm.bl_number} onChange={(e) => setEntryForm({ ...entryForm, bl_number: e.target.value })} />
                      </div>
                      <div>
                        <Label>Taux unitaire (FCFA/L) *</Label>
                        <Input type="number" min="0" value={entryForm.rate_per_liter} onChange={(e) => setEntryForm({ ...entryForm, rate_per_liter: Math.max(0, Number(e.target.value)) })} />
                      </div>
                      <div>
                        <Label>Montant total</Label>
                        <Input value={formatCurrency(totalAmount)} disabled className="font-semibold" />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Notes</Label>
                        <Textarea value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEntryOpen(false)}>Annuler</Button>
                      <Button
                        disabled={!entryForm.station_id || entryForm.quantity_liters <= 0 || entryForm.rate_per_liter <= 0}
                        onClick={async () => {
                          await createEntry({
                            station_id: entryForm.station_id,
                            supply_id: entryForm.supply_id === "none" ? null : entryForm.supply_id,
                            zone_id: entryForm.zone_id === "none" ? null : entryForm.zone_id,
                            product_type: entryForm.product_type,
                            quantity_liters: entryForm.quantity_liters,
                            delivery_date: entryForm.delivery_date,
                            bl_number: entryForm.bl_number || null,
                            rate_per_liter: entryForm.rate_per_liter,
                            status: "pending",
                            received_date: null,
                            notes: entryForm.notes || null,
                          });
                          setEntryOpen(false);
                          setEntryForm({ ...entryForm, station_id: "", supply_id: "none", zone_id: "none", quantity_liters: 0, bl_number: "", rate_per_liter: 0, notes: "" });
                        }}
                      >Enregistrer</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune entrée enregistrée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Station</TableHead>
                        <TableHead>Zone</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Quantité (L)</TableHead>
                        <TableHead className="text-right">Taux</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                        <TableHead>BL</TableHead>
                        <TableHead>Statut</TableHead>
                        {canEdit && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{format(new Date(e.delivery_date), "dd/MM/yyyy", { locale: fr })}</TableCell>
                          <TableCell>{stationsMap.get(e.station_id)?.name || "—"}</TableCell>
                          <TableCell>{e.zone_id ? zonesMap.get(e.zone_id)?.name : "—"}</TableCell>
                          <TableCell><Badge variant="outline">{e.product_type === "super" ? "Super" : "Gasoil"}</Badge></TableCell>
                          <TableCell className="text-right">{Number(e.quantity_liters).toLocaleString("fr-FR")}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(e.rate_per_liter))}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(Number(e.total_amount))}</TableCell>
                          <TableCell>{e.bl_number || "—"}</TableCell>
                          <TableCell>
                            {e.status === "received" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Reçu</Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">À recouvrer</Badge>
                            )}
                          </TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {e.status === "pending" ? (
                                  <Button size="sm" variant="outline" onClick={() => updateEntryStatus(e.id, "received", new Date().toISOString().split("T")[0])}>
                                    <CheckCircle2 className="w-4 h-4 mr-1" />Marquer reçu
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" onClick={() => updateEntryStatus(e.id, "pending", null)}>
                                    Annuler
                                  </Button>
                                )}
                                {canDelete && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button size="sm" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Supprimer cette entrée ?</AlertDialogTitle>
                                        <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteEntry(e.id)}>Supprimer</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Taux === */}
        <TabsContent value="rates">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Taux de péréquation par zone</CardTitle>
              {canEdit && (
                <Dialog open={rateOpen} onOpenChange={setRateOpen}>
                  <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" />Nouveau taux</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nouveau taux</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Zone *</Label>
                        <Select value={rateForm.zone_id} onValueChange={(v) => setRateForm({ ...rateForm, zone_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                          <SelectContent>
                            {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Produit *</Label>
                        <Select value={rateForm.product_type} onValueChange={(v: ProductType) => setRateForm({ ...rateForm, product_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super">Super</SelectItem>
                            <SelectItem value="gasoil">Gasoil</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Taux (FCFA/L) *</Label>
                        <Input type="number" min="0" value={rateForm.rate_per_liter} onChange={(e) => setRateForm({ ...rateForm, rate_per_liter: Math.max(0, Number(e.target.value)) })} />
                      </div>
                      <div>
                        <Label>Date d'effet</Label>
                        <Input type="date" value={rateForm.effective_from} onChange={(e) => setRateForm({ ...rateForm, effective_from: e.target.value })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRateOpen(false)}>Annuler</Button>
                      <Button disabled={!rateForm.zone_id || rateForm.rate_per_liter <= 0} onClick={async () => {
                        await createRate(rateForm.zone_id, rateForm.product_type, rateForm.rate_per_liter, rateForm.effective_from);
                        setRateOpen(false);
                        setRateForm({ ...rateForm, rate_per_liter: 0 });
                      }}>Enregistrer</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {rates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun taux configuré.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zone</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Taux (FCFA/L)</TableHead>
                      <TableHead>Date d'effet</TableHead>
                      {canDelete && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{zonesMap.get(r.zone_id)?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{r.product_type === "super" ? "Super" : "Gasoil"}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(r.rate_per_liter))}</TableCell>
                        <TableCell>{format(new Date(r.effective_from), "dd/MM/yyyy", { locale: fr })}</TableCell>
                        {canDelete && (
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => deleteRate(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Zones === */}
        <TabsContent value="zones">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Zones de péréquation</CardTitle>
              {canEdit && (
                <Dialog open={zoneOpen} onOpenChange={setZoneOpen}>
                  <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" />Nouvelle zone</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nouvelle zone</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Nom *</Label>
                        <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Ex: Zone Nord" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={zoneDesc} onChange={(e) => setZoneDesc(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setZoneOpen(false)}>Annuler</Button>
                      <Button disabled={!zoneName.trim()} onClick={async () => {
                        await createZone(zoneName.trim(), zoneDesc.trim());
                        setZoneOpen(false);
                        setZoneName(""); setZoneDesc("");
                      }}>Créer</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {zones.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucune zone définie.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Description</TableHead>
                      {canDelete && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zones.map((z) => (
                      <TableRow key={z.id}>
                        <TableCell className="font-medium">{z.name}</TableCell>
                        <TableCell className="text-muted-foreground">{z.description || "—"}</TableCell>
                        {canDelete && (
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => deleteZone(z.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
