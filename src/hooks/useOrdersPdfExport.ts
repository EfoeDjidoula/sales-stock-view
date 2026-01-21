import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Order {
  id: string;
  proforma_number: string;
  product_type: "super" | "gasoil";
  supplier: string;
  unit_price: number;
  total_quantity: number;
  amount_ht: number;
  amount_ttc: number;
  created_at: string;
  station?: { name: string } | null;
}

interface Supply {
  id: string;
  product_type: "super" | "gasoil";
  quantity_received: number;
  reception_date: string;
  notes?: string | null;
  station?: { name: string } | null;
  order?: {
    proforma_number: string;
    supplier: string;
    unit_price: number;
  } | null;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + " FCFA";
};

export const useOrdersPdfExport = () => {
  const exportOrdersPdf = (orders: Order[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    const primaryColor: [number, number, number] = [245, 158, 11];
    const textColor: [number, number, number] = [31, 41, 55];
    const mutedColor: [number, number, number] = [107, 114, 128];
    const superColor: [number, number, number] = [245, 158, 11];
    const gasoilColor: [number, number, number] = [16, 185, 129];

    let y = 20;

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("YATT & CO ENERGY BENIN SA", pageWidth / 2, 18, { align: "center" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Liste des Commandes", pageWidth / 2, 28, { align: "center" });
    
    y = 55;

    // Date
    doc.setTextColor(...mutedColor);
    doc.setFontSize(10);
    doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy", { locale: fr })}`, 20, y);
    
    y += 10;

    // Summary
    const totalHT = orders.reduce((sum, o) => sum + o.amount_ht, 0);
    const totalTTC = orders.reduce((sum, o) => sum + o.amount_ttc, 0);
    const superOrders = orders.filter(o => o.product_type === "super");
    const gasoilOrders = orders.filter(o => o.product_type === "gasoil");

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, "F");
    
    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "bold");
    doc.text("Résumé", 25, y + 8);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Total commandes: ${orders.length}`, 25, y + 16);
    doc.text(`Super: ${superOrders.length} | Gasoil: ${gasoilOrders.length}`, 25, y + 23);
    
    doc.setFont("helvetica", "bold");
    doc.text(`Total HT: ${formatCurrency(totalHT)}`, pageWidth - 25, y + 16, { align: "right" });
    doc.text(`Total TTC: ${formatCurrency(totalTTC)}`, pageWidth - 25, y + 23, { align: "right" });

    y += 40;

    // Table header
    doc.setFillColor(249, 250, 251);
    doc.rect(20, y, pageWidth - 40, 10, "F");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.setFont("helvetica", "bold");
    
    const cols = [25, 50, 75, 105, 135, 165];
    doc.text("N° Pro Forma", cols[0], y + 7);
    doc.text("Produit", cols[1], y + 7);
    doc.text("Station", cols[2], y + 7);
    doc.text("Fournisseur", cols[3], y + 7);
    doc.text("Montant HT", cols[4], y + 7);
    doc.text("Montant TTC", cols[5], y + 7);
    
    y += 12;

    // Table rows
    doc.setFont("helvetica", "normal");
    orders.forEach((order, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(20, y - 3, pageWidth - 40, 10, "F");
      }

      doc.setTextColor(...textColor);
      doc.setFontSize(8);
      doc.text(order.proforma_number, cols[0], y + 4);
      
      doc.setTextColor(...(order.product_type === "super" ? superColor : gasoilColor));
      doc.text(order.product_type === "super" ? "Super" : "Gasoil", cols[1], y + 4);
      
      doc.setTextColor(...textColor);
      doc.text(order.station?.name || "-", cols[2], y + 4);
      doc.text(order.supplier.substring(0, 15), cols[3], y + 4);
      doc.text(formatCurrency(order.amount_ht), cols[4], y + 4);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(order.amount_ttc), cols[5], y + 4);
      doc.setFont("helvetica", "normal");
      
      y += 10;
    });

    // Footer
    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text("© 2026 YATT & CO ENERGY BENIN SA", pageWidth / 2, y, { align: "center" });

    doc.save(`Commandes_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const exportSuppliesPdf = (supplies: Supply[]) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    const primaryColor: [number, number, number] = [245, 158, 11];
    const textColor: [number, number, number] = [31, 41, 55];
    const mutedColor: [number, number, number] = [107, 114, 128];
    const superColor: [number, number, number] = [245, 158, 11];
    const gasoilColor: [number, number, number] = [16, 185, 129];

    let y = 20;

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("YATT & CO ENERGY BENIN SA", pageWidth / 2, 18, { align: "center" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Liste des Approvisionnements", pageWidth / 2, 28, { align: "center" });
    
    y = 55;

    // Date
    doc.setTextColor(...mutedColor);
    doc.setFontSize(10);
    doc.text(`Généré le ${format(new Date(), "dd MMMM yyyy", { locale: fr })}`, 20, y);
    
    y += 10;

    // Summary
    const totalQuantity = supplies.reduce((sum, s) => sum + s.quantity_received, 0);
    const totalValue = supplies.reduce((sum, s) => {
      if (s.order) {
        return sum + (s.quantity_received * s.order.unit_price * 1.18);
      }
      return sum;
    }, 0);
    const superSupplies = supplies.filter(s => s.product_type === "super");
    const gasoilSupplies = supplies.filter(s => s.product_type === "gasoil");

    doc.setFillColor(255, 251, 235);
    doc.roundedRect(20, y, pageWidth - 40, 30, 3, 3, "F");
    
    doc.setFontSize(10);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "bold");
    doc.text("Résumé", 25, y + 8);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Total approvisionnements: ${supplies.length}`, 25, y + 16);
    doc.text(`Super: ${superSupplies.length} | Gasoil: ${gasoilSupplies.length}`, 25, y + 23);
    
    doc.setFont("helvetica", "bold");
    doc.text(`Total Litres: ${totalQuantity.toLocaleString("fr-FR")} L`, pageWidth - 25, y + 16, { align: "right" });
    doc.text(`Valeur TTC: ${formatCurrency(totalValue)}`, pageWidth - 25, y + 23, { align: "right" });

    y += 40;

    // Table header
    doc.setFillColor(249, 250, 251);
    doc.rect(20, y, pageWidth - 40, 10, "F");
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.setFont("helvetica", "bold");
    
    const cols = [25, 50, 75, 105, 130, 155];
    doc.text("N° Pro Forma", cols[0], y + 7);
    doc.text("Produit", cols[1], y + 7);
    doc.text("Station", cols[2], y + 7);
    doc.text("Qté reçue", cols[3], y + 7);
    doc.text("Valeur TTC", cols[4], y + 7);
    doc.text("Date", cols[5], y + 7);
    
    y += 12;

    // Table rows
    doc.setFont("helvetica", "normal");
    supplies.forEach((supply, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      if (index % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(20, y - 3, pageWidth - 40, 10, "F");
      }

      const valueTTC = supply.order 
        ? supply.quantity_received * supply.order.unit_price * 1.18 
        : 0;

      doc.setTextColor(...textColor);
      doc.setFontSize(8);
      doc.text(supply.order?.proforma_number || "-", cols[0], y + 4);
      
      doc.setTextColor(...(supply.product_type === "super" ? superColor : gasoilColor));
      doc.text(supply.product_type === "super" ? "Super" : "Gasoil", cols[1], y + 4);
      
      doc.setTextColor(...textColor);
      doc.text(supply.station?.name || "-", cols[2], y + 4);
      doc.text(`${supply.quantity_received.toLocaleString("fr-FR")} L`, cols[3], y + 4);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(valueTTC), cols[4], y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(format(new Date(supply.reception_date), "dd/MM/yyyy"), cols[5], y + 4);
      
      y += 10;
    });

    // Footer
    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.text("© 2026 YATT & CO ENERGY BENIN SA", pageWidth / 2, y, { align: "center" });

    doc.save(`Approvisionnements_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return { exportOrdersPdf, exportSuppliesPdf };
};
