import { useState } from "react";
import { useOrders, OrderInsert, ProductType, OrderStatus } from "@/hooks/useOrders";
import { useStations } from "@/hooks/useStations";
import { useOrdersPdfExport } from "@/hooks/useOrdersPdfExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, FileText, Loader2, Fuel, Download, Clock, CheckCircle2, Truck, ChevronDown } from "lucide-react";
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

const statusConfig: Record<OrderStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: {
    label: "En attente",
    icon: <Clock className="w-3 h-3" />,
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300",
  },
  validated: {
    label: "Validée",
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300",
  },
  delivered: {
    label: "Livrée",
    icon: <Truck className="w-3 h-3" />,
    className: "bg-green-100 text-green-800 hover:bg-green-200 border-green-300",
  },
};

const StatusBadge = ({ 
  status, 
  orderId, 
  onStatusChange 
}: { 
  status: OrderStatus; 
  orderId: string; 
  onStatusChange: (id: string, status: OrderStatus) => void;
}) => {
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`h-7 gap-1 text-xs font-medium border ${config.className}`}
        >
          {config.icon}
          {config.label}
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(statusConfig) as OrderStatus[]).map((statusKey) => (
          <DropdownMenuItem
            key={statusKey}
            onClick={() => onStatusChange(orderId, statusKey)}
            className="gap-2"
          >
            {statusConfig[statusKey].icon}
            {statusConfig[statusKey].label}
            {statusKey === status && <CheckCircle2 className="w-3 h-3 ml-auto text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const OrdersModule = () => {
  const { orders, loading, createOrder, updateOrderStatus, deleteOrder } = useOrders();
  const { stations, loading: stationsLoading } = useStations();
  const { exportOrdersPdf } = useOrdersPdfExport();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<OrderInsert>({
    station_id: "",
    proforma_number: "",
    supplier: "",
    product_type: "super",
    unit_price: 0,
    total_quantity: 0,
    amount_ht: 0,
    amount_ttc: 0,
  });

  const handleInputChange = (field: keyof OrderInsert, value: string | number) => {
    const newFormData = { ...formData, [field]: value };

    // Auto-calculate amounts
    if (field === "unit_price" || field === "total_quantity") {
      const unitPrice = field === "unit_price" ? Number(value) : formData.unit_price;
      const quantity = field === "total_quantity" ? Number(value) : formData.total_quantity;
      newFormData.amount_ht = unitPrice * quantity;
      newFormData.amount_ttc = newFormData.amount_ht * 1.18; // 18% TVA
    }

    setFormData(newFormData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createOrder(formData);
    if (result) {
      setIsOpen(false);
      setFormData({
        station_id: "",
        proforma_number: "",
        supplier: "",
        product_type: "super",
        unit_price: 0,
        total_quantity: 0,
        amount_ht: 0,
        amount_ttc: 0,
      });
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
          <h2 className="text-xl font-display font-semibold">Gestion des Commandes</h2>
          <p className="text-sm text-muted-foreground">
            Créez et gérez vos bons de commande (Pro Forma)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {orders.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => exportOrdersPdf(orders)}>
              <Download className="w-4 h-4" />
              Exporter PDF
            </Button>
          )}
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle commande
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Créer une commande
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="proforma_number">N° Pro Forma</Label>
                  <Input
                    id="proforma_number"
                    value={formData.proforma_number}
                    onChange={(e) => handleInputChange("proforma_number", e.target.value)}
                    placeholder="PF-2026-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="station_id">Station</Label>
                  <Select
                    value={formData.station_id}
                    onValueChange={(value) => handleInputChange("station_id", value)}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {stations.map((station) => (
                        <SelectItem key={station.id} value={station.id}>
                          {station.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product_type">Type de produit</Label>
                <Select
                  value={formData.product_type}
                  onValueChange={(value) => handleInputChange("product_type", value as ProductType)}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super">
                      <div className="flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-amber-500" />
                        Super
                      </div>
                    </SelectItem>
                    <SelectItem value="gasoil">
                      <div className="flex items-center gap-2">
                        <Fuel className="w-4 h-4 text-emerald-500" />
                        Gasoil
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier">Fournisseur</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => handleInputChange("supplier", e.target.value)}
                  placeholder="Nom du fournisseur"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="unit_price">Prix unitaire (FCFA)</Label>
                  <Input
                    id="unit_price"
                    type="number"
                    value={formData.unit_price || ""}
                    onChange={(e) => handleInputChange("unit_price", Number(e.target.value))}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="total_quantity">Quantité totale (L)</Label>
                  <Input
                    id="total_quantity"
                    type="number"
                    value={formData.total_quantity || ""}
                    onChange={(e) => handleInputChange("total_quantity", Number(e.target.value))}
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount_ht">Montant HT (FCFA)</Label>
                  <Input
                    id="amount_ht"
                    type="number"
                    value={formData.amount_ht || ""}
                    onChange={(e) => handleInputChange("amount_ht", Number(e.target.value))}
                    className="bg-muted"
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount_ttc">Montant TTC (FCFA)</Label>
                  <Input
                    id="amount_ttc"
                    type="number"
                    value={Math.round(formData.amount_ttc) || ""}
                    onChange={(e) => handleInputChange("amount_ttc", Number(e.target.value))}
                    className="bg-muted"
                    readOnly
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={stationsLoading}>
                  Créer la commande
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Liste des commandes</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune commande enregistrée</p>
              <p className="text-sm">Créez votre première commande</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Pro Forma</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Produit</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Montant TTC</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.proforma_number}</TableCell>
                      <TableCell>
                        <StatusBadge 
                          status={(order.status as OrderStatus) || "pending"} 
                          orderId={order.id}
                          onStatusChange={updateOrderStatus}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={order.product_type === "super" ? "default" : "secondary"} className={order.product_type === "super" ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"}>
                          {getProductLabel(order.product_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>{order.station?.name || "-"}</TableCell>
                      <TableCell>{order.supplier}</TableCell>
                      <TableCell className="text-right">{order.total_quantity.toLocaleString()} L</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(order.amount_ttc)}</TableCell>
                      <TableCell>
                        {format(new Date(order.created_at), "dd MMM yyyy", { locale: fr })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteOrder(order.id)}
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
