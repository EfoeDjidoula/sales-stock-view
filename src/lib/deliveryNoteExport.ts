import QRCode from "qrcode";
import { jsPDF } from "./pdf";
import { DEFAULT_BRAND } from "./branding";
import { preloadLetterheadLogo } from "./pdfLetterhead";
import { BL_ROLES, BL_ROLE_LABEL, type DeliveryNote } from "./deliveryNotes";
import { DECISION_LABEL } from "@/components/pro/EcmrSignDialog";

export async function exportDeliveryNote(note: DeliveryNote) {
  const brand = { ...DEFAULT_BRAND, ...note.snapshot.brand };
  await preloadLetterheadLogo(brand.logoUrl);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.letterheadBrand = brand;
  const s = note.snapshot;
  const url = new URL(window.location.origin + "/");
  url.searchParams.set("tenant",note.tenant_id); url.searchParams.set("country",note.country_id);
  url.searchParams.set("tab","logistique_avancee"); url.searchParams.set("bl",note.id);
  const qr = await QRCode.toDataURL(url.toString(), { margin: 1, width: 220 });
  doc.setFontSize(16); doc.text("BON DE LIVRAISON",14,18);
  doc.setFontSize(10); doc.text(note.number,14,25);
  doc.addImage(qr,"PNG",164,10,30,30);
  doc.setFontSize(9);
  let y = 42;
  for (const text of [`Destination : ${s.site}`, `BE : ${s.be ?? "—"} · Transport : ${s.trip}`, `Camion : ${s.truck ?? "—"} · Citerne : ${s.tanker ?? "—"}`, `Chauffeur : ${s.driver ?? "—"} · Permis : ${s.license ?? "—"}`, `Chargé le : ${new Date(s.loaded_at).toLocaleString("fr-FR")}`, `Scellés du transport : ${s.seals.join(", ") || "—"}`]) {
    const lines = doc.splitTextToSize(text,178); doc.text(lines,14,y); y += lines.length * 5 + 2;
  }
  y += 3;
  doc.setFont("helvetica","bold"); doc.text("Compartiment",14,y); doc.text("Produit",55,y); doc.text("Volume BL (L)",182,y,{align:"right"});
  doc.setFont("helvetica","normal"); y += 7;
  for (const line of s.lines) {
    if (y > 230) { doc.addPage(); y=20; }
    const product = doc.splitTextToSize(line.product,85);
    doc.text(String(line.compartment ?? "—"),14,y); doc.text(product,55,y); doc.text(Number(line.litres).toLocaleString("fr-FR"),182,y,{align:"right"});
    y += Math.max(7,product.length*5);
  }
  doc.setFont("helvetica","bold"); doc.text(`TOTAL : ${s.lines.reduce((sum,l)=>sum+Number(l.litres),0).toLocaleString("fr-FR")} L`,182,y,{align:"right"}); y+=12;
  if(y>175) { doc.addPage(); y=20; }
  for(const role of BL_ROLES) {
    const sig = note.signatures.find(x=>x.role===role);
    doc.setFont("helvetica","bold"); doc.text(BL_ROLE_LABEL[role],14,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    if(sig) {
      doc.addImage(sig.signature_png,"PNG",130,y-3,55,17);
      const text = [sig.signer_name, new Date(sig.signed_at).toLocaleString("fr-FR"),DECISION_LABEL[sig.decision] ?? sig.decision];
      doc.text(text,14,y+5); y+=24;
      if(sig.reserves) { const lines = doc.splitTextToSize(`Réserves : ${sig.reserves}`,175); if(y+lines.length*4>275){doc.addPage();y=20;} doc.text(lines,14,y); y+=lines.length*4+4; }
    } else { doc.text("En attente de signature",14,y+6); y+=25; }
  }
  doc.save(`${note.number}.pdf`);
}