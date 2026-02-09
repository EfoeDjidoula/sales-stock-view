import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useExcelImport, ParsedIndexEntry } from "@/hooks/useExcelImport";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ExcelImportDialogProps {
  trigger?: React.ReactNode;
}

export const ExcelImportDialog = ({ trigger }: ExcelImportDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedIndexEntry[]>([]);
  const [importStatus, setImportStatus] = useState<"idle" | "preview" | "importing" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { importFile, parseExcelFile, isProcessing, progress } = useExcelImport();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
      return;
    }
    
    setSelectedFile(file);
    setImportStatus("preview");
    
    try {
      const entries = await parseExcelFile(file);
      setPreview(entries);
    } catch {
      setPreview([]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    
    setImportStatus("importing");
    await importFile(selectedFile);
    setImportStatus("done");
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedFile(null);
    setPreview([]);
    setImportStatus("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.match(/\.(xlsx|xls)$/i)) {
      setSelectedFile(file);
      setImportStatus("preview");
      try {
        const entries = await parseExcelFile(file);
        setPreview(entries);
      } catch {
        setPreview([]);
      }
    }
  };

  // Group preview by station
  const previewByStation = preview.reduce((acc, entry) => {
    if (!acc[entry.stationName]) {
      acc[entry.stationName] = [];
    }
    acc[entry.stationName].push(entry);
    return acc;
  }, {} as Record<string, ParsedIndexEntry[]>);

  return (
    <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : handleClose()}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            Importer Excel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Importation Excel
          </DialogTitle>
          <DialogDescription>
            Importez vos données de suivi d'index depuis un fichier Excel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {importStatus === "idle" && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Glissez-déposez votre fichier Excel ici, ou cliquez pour parcourir
              </p>
              <p className="text-xs text-muted-foreground">
                Formats acceptés: .xlsx, .xls
              </p>
            </div>
          )}

          {importStatus === "preview" && preview.length > 0 && (
            <>
              <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{selectedFile?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {preview.length} entrées détectées • {Object.keys(previewByStation).length} station(s)
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview([]);
                    setImportStatus("idle");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <ScrollArea className="h-64 border rounded-lg p-3">
                {Object.entries(previewByStation).map(([station, entries]) => (
                  <div key={station} className="mb-4 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{station}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {entries.length} jours
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-3 space-y-1">
                      {entries.slice(0, 3).map((entry, i) => (
                        <div key={i} className="flex gap-4">
                          <span className="font-mono">{entry.date}</span>
                          <span>
                            Super: {(entry.super1.indexArrivee - entry.super1.indexDepart + entry.super2.indexArrivee - entry.super2.indexDepart).toFixed(0)}L
                          </span>
                          <span>
                            Gasoil: {(entry.gasoil1.indexArrivee - entry.gasoil1.indexDepart + entry.gasoil2.indexArrivee - entry.gasoil2.indexDepart).toFixed(0)}L
                          </span>
                        </div>
                      ))}
                      {entries.length > 3 && (
                        <div className="text-muted-foreground">
                          ... et {entries.length - 3} autres jours
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </ScrollArea>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Annuler
                </Button>
                <Button onClick={handleImport} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Importer {preview.length} entrées
                </Button>
              </div>
            </>
          )}

          {importStatus === "importing" && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <div>
                <p className="font-medium">Importation en cours...</p>
                <p className="text-sm text-muted-foreground">
                  {progress.current} / {progress.total} entrées
                </p>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="max-w-xs mx-auto" />
            </div>
          )}

          {importStatus === "done" && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle className="w-12 h-12 mx-auto text-primary" />
              <div>
                <p className="font-medium">Importation terminée</p>
                <p className="text-sm text-muted-foreground">
                  {progress.current} entrées traitées
                </p>
              </div>
              <Button onClick={handleClose}>Fermer</Button>
            </div>
          )}

          {importStatus === "preview" && preview.length === 0 && selectedFile && (
            <div className="py-8 text-center space-y-4">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
              <div>
                <p className="font-medium">Aucune donnée détectée</p>
                <p className="text-sm text-muted-foreground">
                  Vérifiez que le fichier correspond au format attendu
                </p>
              </div>
              <Button variant="outline" onClick={() => {
                setSelectedFile(null);
                setPreview([]);
                setImportStatus("idle");
              }}>
                Réessayer
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
