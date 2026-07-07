import { useRef, useState } from "react";
import {
  usePriceStructures,
  parsePriceStructureFile,
  ParsedPriceStructure,
  PriceStructure,
} from "@/hooks/usePriceStructures";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Fuel,
  Trash2,
  AlertTriangle,
  Eye,
  CheckCircle2,
  FileDown,
  Power,
} from "lucide-react";
import { exportPriceStructurePdf } from "@/lib/priceStructurePdf";

const formatFcfa = (n: number | null) =>
  n == null ? "-" : n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + " ";

const formatDateFr = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

export const PriceStructureModule = () => {
  const { structures, loading, importStructure, toggleActive, deleteStructure } =
    usePriceStructures();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedPriceStructure | null>(null);
  const [fileName, setFileName] = useState("");
  const [label, setLabel] = useState("");
  const [importing, setImporting] = useState(false);

  const [detail, setDetail] = useState<PriceStructure | null>(null);
  const [toDelete, setToDelete] = useState<PriceStructure | null>(null);
  const [toToggle, setToToggle] = useState<PriceStructure | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Format non pris en charge", { description: "Sélectionnez un fichier Excel .xlsx." });
      return;
    }
    try {
      const result = await parsePriceStructureFile(file);
      setParsed(result);
      setFileName(file.name);
      setLabel(`Structure BJ ${formatDateFr(result.effective_date)}`);
      setImportOpen(true);
    } catch (error) {
      toast.error("Impossible de lire le fichier", {
        description: error instanceof Error ? error.message : "Format non reconnu.",
      });
    }
  };

  const confirmImport = async () => {
    if (!parsed) return;
    setImporting(true);
    const res = await importStructure(parsed, label.trim() || undefined);
    setImporting(false);
    if (res) {
      setImportOpen(false);
      setParsed(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" />
            Structure de prix
          </h2>
          <p className="text-sm text-muted-foreground">
            Base des structures de prix par période (Bénin). Les prix de vente Super et Gasoil en
            découlent.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
        <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
          <Upload className="w-4 h-4" />
          Importer une structure
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : structures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="font-medium">Aucune structure de prix</p>
            <p className="text-sm text-muted-foreground">
              Importez le fichier Excel de la structure de prix pour commencer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Structures enregistrées</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date d'application</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Prix Super</TableHead>
                  <TableHead className="text-right">Prix Gasoil</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{formatDateFr(s.effective_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{s.label || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatFcfa(s.super_price)}</TableCell>
                    <TableCell className="text-right font-mono">{formatFcfa(s.gasoil_price)}</TableCell>
                    <TableCell>
                      <button onClick={() => setToToggle(s)}>
                        <Badge variant={s.is_active ? "default" : "secondary"} className="cursor-pointer">
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setDetail(s)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Exporter en PDF"
                          onClick={() => exportPriceStructurePdf(s)}
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setToDelete(s)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Import confirmation dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => !o && setImportOpen(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              Importer la structure de prix
            </DialogTitle>
            <DialogDescription>{fileName}</DialogDescription>
          </DialogHeader>
          {parsed && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Date d'application</p>
                  <p className="font-semibold">{formatDateFr(parsed.effective_date)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Prix Super</p>
                  <p className="font-semibold">{formatFcfa(parsed.super_price)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Prix Gasoil</p>
                  <p className="font-semibold">{formatFcfa(parsed.gasoil_price)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-label">Libellé</Label>
                <Input id="ps-label" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <ScrollArea className="h-56 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élément</TableHead>
                      <TableHead className="text-right">Super</TableHead>
                      <TableHead className="text-right">Gasoil</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.elements.map((el, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{el.label}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatFcfa(el.super)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatFcfa(el.gasoil)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={confirmImport} disabled={importing} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {importing ? "Import..." : "Confirmer l'import"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.label || "Structure de prix"}</DialogTitle>
            <DialogDescription>
              {detail && `Application au ${formatDateFr(detail.effective_date)}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <ScrollArea className="h-96 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Élément</TableHead>
                    <TableHead className="text-right">Super</TableHead>
                    <TableHead className="text-right">Gasoil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.elements.map((el, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{el.label}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatFcfa(el.super)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatFcfa(el.gasoil)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          {detail && (
            <div className="flex justify-end">
              <Button variant="outline" className="gap-2" onClick={() => exportPriceStructurePdf(detail)}>
                <FileDown className="w-4 h-4" />
                Exporter en PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Supprimer la structure de prix
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement la structure du{" "}
              {toDelete && formatDateFr(toDelete.effective_date)} ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteStructure(toDelete.id);
                setToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
