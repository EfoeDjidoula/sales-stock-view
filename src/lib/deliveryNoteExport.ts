import QRCode from "qrcode";
import { jsPDF } from "./pdf";
import { DEFAULT_BRAND } from "./branding";
import { preloadLetterheadLogo } from "./pdfLetterhead";
import { BL_ROLES, blQuantities, consigneeLabel, roleLabel, varianceLabel, type DeliveryNote } from "./deliveryNotes";
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
  for (const text of [`Destination : ${s.site} (${consigneeLabel(note)})`, `BE : ${s.be ?? "—"} · Transport : ${s.trip}`, `Camion : ${s.truck ?? "—"} · Citerne : ${s.tanker ?? "—"}`, `Chauffeur : ${s.driver ?? "—"} · Permis : ${s.license ?? "—"}`, `Chargé le : ${new Date(s.loaded_at).toLocaleString("fr-FR")}`, `Scellés du transport : ${s.seals.join(", ") || "—"}`]) {
    const lines = doc.splitTextToSize(text,178); doc.text(lines,14,y); y += lines.length * 5 + 2;
  }
  y += 3;
  const q = blQuantities(note);
  const f = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " "));
  const sv = (v: number | null, p?: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${f(v)}${p != null ? ` (${p.toFixed(2)} %)` : ""}`);
  const cols = [14, 34, 100, 135, 182];
  doc.setFillColor(230,230,230); doc.rect(12,y-5,186,7,"F");
  doc.setFont("helvetica","bold"); doc.text("Comp.",cols[0],y); doc.text("Produit",cols[1],y); doc.text("Volume BL (L)",cols[2]+22,y,{align:"right"}); doc.text("Qté dépotée (L)",cols[3]+22,y,{align:"right"}); doc.text("Écart chauffeur",cols[4],y,{align:"right"});
  doc.setFont("helvetica","normal"); y += 7;
  for (const line of q.lines) {
    if (y > 230) { doc.addPage(); y=20; }
    const product = doc.splitTextToSize(line.product,60);
    doc.text(String(line.compartment ?? "—"),cols[0],y); doc.text(product,cols[1],y);
    doc.text(f(line.litres),cols[2]+22,y,{align:"right"}); doc.text(line.received === null ? "Non dépoté" : f(line.received),cols[3]+22,y,{align:"right"}); doc.text(sv(line.variance,line.variancePct),cols[4],y,{align:"right"});
    doc.line(12,y+2,198,y+2); y += Math.max(7,product.length*5);
  }
  doc.setFont("helvetica","bold");
  doc.text("TOTAL",cols[0],y); doc.text(f(q.bl),cols[2]+22,y,{align:"right"}); doc.text(f(q.received),cols[3]+22,y,{align:"right"}); doc.text(q.variance === null ? "—" : `${sv(q.variance)} ${varianceLabel(q.variance)}`,cols[4],y,{align:"right"});
  doc.setFont("helvetica","normal"); y+=12;
  if(y>175) { doc.addPage(); y=20; }
  for(const role of BL_ROLES) {
    const sig = note.signatures.find(x=>x.role===role);
    doc.setFont("helvetica","bold"); doc.text(roleLabel(note, role),14,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    if(sig) {
      doc.addImage(sig.signature_png,"PNG",130,y-3,55,17);
      const text = [role === "carrier" ? `${sig.signer_name} (signé sur l'appareil du réceptionnaire)` : sig.signer_name, new Date(sig.signed_at).toLocaleString("fr-FR"),DECISION_LABEL[sig.decision] ?? sig.decision];
      doc.text(text,14,y+5); y+=24;
      if(sig.reserves) { const lines = doc.splitTextToSize(`Réserves : ${sig.reserves}`,175); if(y+lines.length*4>275){doc.addPage();y=20;} doc.text(lines,14,y); y+=lines.length*4+4; }
    } else { doc.text(role === "carrier" ? `En attente — ${s.driver ?? "chauffeur"}` : "En attente de signature",14,y+6); y+=25; }
  }
  doc.save(`${note.number}.pdf`);
}