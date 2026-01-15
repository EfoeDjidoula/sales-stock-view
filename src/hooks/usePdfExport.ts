import { jsPDF } from "jspdf";
import { formatNumber } from "@/data/stationsData";

interface PdfExportData {
  stationName: string;
  stationLocation: string;
  date: string;
  super: {
    liters: number;
    amount: number;
  };
  gasoil: {
    liters: number;
    amount: number;
  };
  versements: {
    momo: number;
    banque: number;
    liquidite: number;
    total: number;
  };
  bons: {
    carburant: number;
    entreprise: number;
    total: number;
  };
  totalVentes: number;
  totalRecettes: number;
  ecart: number;
}

export const usePdfExport = () => {
  const exportPdf = (data: PdfExportData) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Colors
    const primaryColor: [number, number, number] = [245, 158, 11]; // Amber
    const textColor: [number, number, number] = [31, 41, 55];
    const mutedColor: [number, number, number] = [107, 114, 128];
    const superColor: [number, number, number] = [34, 197, 94];
    const gasoilColor: [number, number, number] = [59, 130, 246];
    const successColor: [number, number, number] = [34, 197, 94];
    const dangerColor: [number, number, number] = [239, 68, 68];

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
    doc.text("Récapitulatif Journalier", pageWidth / 2, 28, { align: "center" });
    
    y = 55;

    // Station info
    doc.setTextColor(...textColor);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(data.stationName, 20, y);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedColor);
    doc.text(data.stationLocation, 20, y + 6);
    
    // Date
    const formattedDate = new Date(data.date).toLocaleDateString("fr-FR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.setTextColor(...primaryColor);
    doc.setFontSize(11);
    doc.text(formattedDate, pageWidth - 20, y + 3, { align: "right" });

    y += 20;

    // Separator
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(20, y, pageWidth - 20, y);
    
    y += 15;

    // VENTES DE CARBURANT
    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("VENTES DE CARBURANT", 20, y);
    
    y += 10;

    // Super
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(20, y, pageWidth / 2 - 25, 30, 3, 3, "F");
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text("Super", 25, y + 8);
    doc.setFontSize(14);
    doc.setTextColor(...superColor);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatNumber(data.super.liters)} L`, 25, y + 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedColor);
    doc.text(`${formatNumber(data.super.amount)} FCFA`, 25, y + 26);

    // Gasoil
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(pageWidth / 2 + 5, y, pageWidth / 2 - 25, 30, 3, 3, "F");
    doc.setFontSize(10);
    doc.setTextColor(...mutedColor);
    doc.text("Gasoil", pageWidth / 2 + 10, y + 8);
    doc.setFontSize(14);
    doc.setTextColor(...gasoilColor);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatNumber(data.gasoil.liters)} L`, pageWidth / 2 + 10, y + 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedColor);
    doc.text(`${formatNumber(data.gasoil.amount)} FCFA`, pageWidth / 2 + 10, y + 26);

    y += 40;

    // Total Ventes
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(20, y, pageWidth - 40, 20, 3, 3, "F");
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "normal");
    doc.text("Total Ventes", 25, y + 13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(`${formatNumber(data.totalVentes)} FCFA`, pageWidth - 25, y + 13, { align: "right" });

    y += 30;

    // VERSEMENTS
    if (data.versements.total > 0) {
      doc.setTextColor(...textColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("VERSEMENTS", 20, y);
      
      y += 10;

      const versementItems = [
        { label: "Mobile Money (MOMO)", value: data.versements.momo, color: [249, 115, 22] as [number, number, number] },
        { label: "Virement Bancaire", value: data.versements.banque, color: [59, 130, 246] as [number, number, number] },
        { label: "Espèces", value: data.versements.liquidite, color: [34, 197, 94] as [number, number, number] },
      ].filter(item => item.value > 0);

      versementItems.forEach((item, index) => {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(20, y, pageWidth - 40, 14, 2, 2, "F");
        doc.setFontSize(10);
        doc.setTextColor(...mutedColor);
        doc.text(item.label, 25, y + 9);
        doc.setTextColor(...item.color);
        doc.setFont("helvetica", "bold");
        doc.text(`${formatNumber(item.value)} FCFA`, pageWidth - 25, y + 9, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 16;
      });

      // Total Versements
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(20, y, pageWidth - 40, 16, 3, 3, "F");
      doc.setFontSize(10);
      doc.setTextColor(...textColor);
      doc.text("Total Versements", 25, y + 11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.text(`${formatNumber(data.versements.total)} FCFA`, pageWidth - 25, y + 11, { align: "right" });

      y += 26;
    }

    // BONS DE VALEUR
    if (data.bons.total > 0) {
      doc.setTextColor(...textColor);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("BONS DE VALEUR", 20, y);
      
      y += 10;

      const bonItems = [
        { label: "Bons Carburant", value: data.bons.carburant },
        { label: "Bons Entreprise", value: data.bons.entreprise },
      ].filter(item => item.value > 0);

      bonItems.forEach((item) => {
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(20, y, pageWidth - 40, 14, 2, 2, "F");
        doc.setFontSize(10);
        doc.setTextColor(...mutedColor);
        doc.text(item.label, 25, y + 9);
        doc.setFont("helvetica", "bold");
        doc.text(`${formatNumber(item.value)} FCFA`, pageWidth - 25, y + 9, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 16;
      });

      // Total Bons
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(20, y, pageWidth - 40, 16, 3, 3, "F");
      doc.setFontSize(10);
      doc.setTextColor(...textColor);
      doc.text("Total Bons de Valeur", 25, y + 11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryColor);
      doc.text(`${formatNumber(data.bons.total)} FCFA`, pageWidth - 25, y + 11, { align: "right" });

      y += 26;
    }

    // RÉCAPITULATIF FINAL
    doc.setDrawColor(229, 231, 235);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RÉCAPITULATIF FINAL", 20, y);
    
    y += 12;

    // Total Recettes
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(20, y, pageWidth - 40, 18, 3, 3, "F");
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "normal");
    doc.text("Total Recettes (Versements + Bons)", 25, y + 12);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatNumber(data.totalRecettes)} FCFA`, pageWidth - 25, y + 12, { align: "right" });

    y += 22;

    // Total Ventes Attendu
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(20, y, pageWidth - 40, 18, 3, 3, "F");
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "normal");
    doc.text("Total Ventes Attendu", 25, y + 12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(`${formatNumber(data.totalVentes)} FCFA`, pageWidth - 25, y + 12, { align: "right" });

    y += 22;

    // Écart
    const ecartColor = data.ecart >= 0 ? successColor : dangerColor;
    const ecartBgColor = data.ecart >= 0 ? [240, 253, 244] : [254, 242, 242];
    doc.setFillColor(...(ecartBgColor as [number, number, number]));
    doc.roundedRect(20, y, pageWidth - 40, 22, 3, 3, "F");
    doc.setFontSize(11);
    doc.setTextColor(...textColor);
    doc.setFont("helvetica", "normal");
    doc.text(data.ecart >= 0 ? "Excédent" : "Écart (Manquant)", 25, y + 14);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ecartColor);
    doc.text(`${data.ecart >= 0 ? "+" : ""}${formatNumber(data.ecart)} FCFA`, pageWidth - 25, y + 14, { align: "right" });

    y += 35;

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(...mutedColor);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Document généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`,
      pageWidth / 2,
      y,
      { align: "center" }
    );
    doc.text("© 2026 YATT & CO ENERGY BENIN SA", pageWidth / 2, y + 5, { align: "center" });

    // Save
    const fileName = `Recap_${data.stationName.replace(/\s+/g, "_")}_${data.date}.pdf`;
    doc.save(fileName);
  };

  return { exportPdf };
};
