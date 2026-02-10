import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useExcelExport } from "@/hooks/useExcelExport";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

interface ExcelExportDialogProps {
  trigger?: React.ReactNode;
}

export const ExcelExportDialog = ({ trigger }: ExcelExportDialogProps) => {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { exportToExcel, isExporting } = useExcelExport();

  const handleExport = async () => {
    await exportToExcel(month, year);
    setOpen(false);
  };

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Exporter
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Exporter en Excel</DialogTitle>
          <DialogDescription>
            Choisissez la période à exporter
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Mois</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {MONTHS.map((name, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Année</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleExport} disabled={isExporting} className="w-full gap-2 mt-2">
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {isExporting ? "Export en cours..." : `Exporter ${MONTHS[month - 1]} ${year}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
