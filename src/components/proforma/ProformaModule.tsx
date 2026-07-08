import { useMemo, useState } from "react";
import { usePriceStructures, PriceStructure } from "@/hooks/usePriceStructures";
import { useClients } from "@/hooks/useClients";
import {
  getTaxBreakdown,
  computeLineTotals,
  computeTotals,
  exportProformaPdf,
  ProformaLine,
} from "@/lib/proforma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FileText, FileDown, Fuel, ReceiptText } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const formatDateFr = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const genNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const seq = String(Math.floor(now.getTime() / 1000)).slice(-5);
  return `PRO-${y}-${seq}`;
};

export const ProformaModule = () => {
  const { structures, loading } = usePriceStructures();
  const { clients, loading: clientsLoading } = useClients();

  const activeStructures = useMemo(
    () => structures.filter((s) => s.is_active),
    [structures]
  );

  const [structureId, setStructureId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("passage");
  const [superQty, setSuperQty] = useState<string>("");
  const [gasoilQty, setGasoilQty] = useState<string>("");
  const [number, setNumber] = useState<string>(genNumber());
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Default structure = first active (or first available)
  const effectiveStructureId =
    structureId || activeStructures[0]?.id || structures[0]?.id || "";
  const structure: PriceStructure | undefined = structures.find(
    (s) => s.id === effectiveStructureId
  );

  const lines: ProformaLine[] = useMemo(() => {
    if (!structure) return [];
    const out: ProformaLine[] = [];
    const sq = parseFloat(superQty.replace(",", ".")) || 0;
    const gq = parseFloat(gasoilQty.replace(",", ".")) || 0;
    if (sq > 0)
      out.push({
        product: "super",
        productLabel: "Super",
        quantity: sq,
        breakdown: getTaxBreakdown(structure, "super"),
      });
    if (gq > 0)
      out.push({
        product: "gasoil",
        productLabel: "Gasoil",
        quantity: gq,
        breakdown: getTaxBreakdown(structure, "gasoil"),
      });
    return out;
  }, [structure, superQty, gasoilQty]);

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const selectedClient = clients.find((c) => c.id === clientId);

  const handleExport = () => {
    if (!structure) {
      toast.error("Sélectionnez une structure de prix active.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Saisissez au moins une quantité (Super ou Gasoil).");
      return;
    }
    exportProformaPdf(lines, {
      number,
      date,
      structureLabel: structure.label || `Structure ${structure.country}`,
      client: selectedClient
        ? {
            name: selectedClient.name,
            address: selectedClient.address,
            phone: selectedClient.phone,
            taxId: selectedClient.tax_id,
          }
        : null,
    });
    toast.success("Proforma exporté en PDF");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-primary" />
            Proforma
          </h2>
          <p className="text-sm text-muted-foreground">
            Établissez une facture proforma à partir de la structure de prix officielle (Bénin) :
            base taxable, base exonérée et TVA.
          </p>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <FileDown className="w-4 h-4" />
          Exporter en PDF
        </Button>
      </div>

      {structures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Fuel className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="font-medium">Aucune structure de prix disponible</p>
            <p className="text-sm text-muted-foreground">
              Importez d'abord une structure de prix pour générer un proforma.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paramètres du proforma</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Numéro</Label>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Structure de prix</Label>
                <Select value={effectiveStructureId} onValueChange={setStructureId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une structure" />
                  </SelectTrigger>
                  <SelectContent>
                    {structures.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.label || `Structure ${s.country}`) +
                          ` — ${formatDateFr(s.effective_date)}`}
                        {s.is_active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId} disabled={clientsLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passage">Client de passage</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantité Super (litres)</Label>
                <Input
                  type="number"
                  min="0"
                  value={superQty}
                  onChange={(e) => setSuperQty(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Quantité Gasoil (litres)</Label>
                <Input
                  type="number"
                  min="0"
                  value={gasoilQty}
                  onChange={(e) => setGasoilQty(e.target.value)}
                  placeholder="0"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détail du proforma</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Saisissez une quantité de Super et/ou de Gasoil pour voir le détail.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead className="text-right">Qté (L)</TableHead>
                        <TableHead className="text-right">PU TTC</TableHead>
                        <TableHead className="text-right">Base taxable</TableHead>
                        <TableHead className="text-right">Base exonérée</TableHead>
                        <TableHead className="text-right">TVA</TableHead>
                        <TableHead className="text-right">Total TTC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => {
                        const t = computeLineTotals(line);
                        return (
                          <TableRow key={line.product}>
                            <TableCell className="font-medium">{line.productLabel}</TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(line.quantity)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(line.breakdown.ttc)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(t.baseTaxable)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(t.baseExoneree)}
                            </TableCell>
                            <TableCell className="text-right font-mono">{fmt(t.tva)}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {fmt(t.ttc)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div className="mt-6 flex justify-end">
                    <div className="w-full max-w-sm space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base taxable HT</span>
                        <span className="font-mono">{fmt(totals.baseTaxable)} FCFA</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base exonérée</span>
                        <span className="font-mono">{fmt(totals.baseExoneree)} FCFA</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">TVA (18%)</span>
                        <span className="font-mono">{fmt(totals.tva)} FCFA</span>
                      </div>
                      <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                        <span>Total TTC</span>
                        <span className="font-mono text-primary">{fmt(totals.ttc)} FCFA</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
