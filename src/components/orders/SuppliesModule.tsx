import { useState } from "react";
import { useSupplies, SupplyInsert, ProductType } from "@/hooks/useSupplies";
import { useOrders } from "@/hooks/useOrders";
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
import { Plus, Trash2, Truck, Loader2, Package } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
  }).format(value);
};

const getProductLabel = (type: ProductType) => {
  return type === "super" ? "Super" : "Gasoil";
};

export const SuppliesModule = () => {
  const { supplies, loading, createSupply, deleteSupply } = useSupplies();
  const { orders, loading: ordersLoading } = useOrders();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<typeof orders[0] | null>(null);
  const [formData, setFormData] = useState<SupplyInsert>({
    order_id: "",
    station_id: "",
    product_type: "super",
    quantity_received: 0,
    reception_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const handleOrderSelect = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      setSelectedOrder(order);
      setFormData({
        ...formData,
        order_id: orderId,
        station_id: order.station_id,
        product_type: order.product_type,
        quantity_received: order.total_quantity,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createSupply(formData);
    if (result) {
      setIsOpen(false);
      setFormData({
        order_id: "",
        station_id: "",
        product_type: "super",
        quantity_received: 0,
        reception_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setSelectedOrder(null);
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
          <h2 className="text-xl font-display font-semibold">Approvisionnements</h2>
          <p className="text-sm text-muted-foreground">
            Enregistrez les réceptions de carburant pour alimenter le dépôt
          </p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nouvel approvisionnement
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Enregistrer un approvisionnement
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="order_id">Référence commande (Pro Forma)</Label>
                <Select
                  value={formData.order_id}
                  onValueChange={handleOrderSelect}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une commande" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.proforma_number} - {order.supplier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedOrder && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Produit:</span>
                      <Badge variant={selectedOrder.product_type === "super" ? "default" : "secondary"} className={selectedOrder.product_type === "super" ? "bg-amber-500" : "bg-emerald-500"}>
                        {getProductLabel(selectedOrder.product_type)}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Station:</span>
                      <span className="font-medium">{selectedOrder.station?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fournisseur:</span>
                      <span>{selectedOrder.supplier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prix unitaire:</span>
                      <span>{formatCurrency(selectedOrder.unit_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quantité commandée:</span>
                      <span>{selectedOrder.total_quantity.toLocaleString()} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Montant TTC:</span>
                      <span className="font-semibold">{formatCurrency(selectedOrder.amount_ttc)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity_received">Quantité reçue (L)</Label>
                  <Input
                    id="quantity_received"
                    type="number"
                    value={formData.quantity_received || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity_received: Number(e.target.value) })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reception_date">Date de réception</Label>
                  <Input
                    id="reception_date"
                    type="date"
                    value={formData.reception_date}
                    onChange={(e) =>
                      setFormData({ ...formData, reception_date: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optionnel)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observations ou commentaires..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={ordersLoading || !formData.order_id}>
                  Enregistrer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des approvisionnements</CardTitle>
        </CardHeader>
        <CardContent>
          {supplies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun approvisionnement enregistré</p>
              <p className="text-sm">Sélectionnez une commande pour enregistrer une réception</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Pro Forma</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead className="text-right">Qté reçue</TableHead>
                    <TableHead className="text-right">Prix unit.</TableHead>
                    <TableHead className="text-right">Valeur TTC</TableHead>
                    <TableHead>Date réception</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplies.map((supply) => (
                    <TableRow key={supply.id}>
                      <TableCell className="font-medium">
                        {supply.order?.proforma_number || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={supply.product_type === "super" ? "default" : "secondary"} className={supply.product_type === "super" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"}>
                          {getProductLabel(supply.product_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>{supply.station?.name || "-"}</TableCell>
                      <TableCell>{supply.order?.supplier || "-"}</TableCell>
                      <TableCell className="text-right">
                        {supply.quantity_received.toLocaleString()} L
                      </TableCell>
                      <TableCell className="text-right">
                        {supply.order ? formatCurrency(supply.order.unit_price) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {supply.order
                          ? formatCurrency(supply.quantity_received * supply.order.unit_price * 1.18)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(supply.reception_date), "dd MMM yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteSupply(supply.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
