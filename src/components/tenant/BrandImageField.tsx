import { useRef, useState } from "react";
import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_IMAGE_ACCEPT, BRAND_IMAGE_MAX_SIDE, isEmbeddedImage, prepareBrandImage, type BrandImageKind } from "@/lib/brandImage";
import { toast } from "sonner";

interface Props {
  id: string;
  label: string;
  kind: BrandImageKind;
  value: string;
  onChange: (value: string) => void;
}

/** Logo ou favicon : glisser-déposer, sélection d'un fichier local, ou lien https. */
export const BrandImageField = ({ id, label, kind, value, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const embedded = isEmbeddedImage(value);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await prepareBrandImage(file, kind));
      toast.success(`${label} importé : ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-url`}>{label}</Label>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Importer ${label.toLowerCase()} depuis l'ordinateur`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); }}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-dashed p-3 cursor-pointer transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-muted/40",
        )}
      >
        <div className="h-14 w-14 shrink-0 rounded-md border border-border bg-muted/50 flex items-center justify-center overflow-hidden">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : value ? (
            <img src={value} alt={`Aperçu ${label.toLowerCase()}`} className="h-full w-full object-contain" />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-medium">{dragging ? "Déposez le fichier ici" : "Glissez-déposez ou cliquez pour choisir"}</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP, GIF ou ICO · 2 Mo max · réduit à {BRAND_IMAGE_MAX_SIDE[kind]} px
          </p>
        </div>
        {value && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto shrink-0"
            aria-label={`Retirer ${label.toLowerCase()}`}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <input ref={inputRef} type="file" accept={BRAND_IMAGE_ACCEPT} className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
      </div>
      <div className="relative">
        <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={`${id}-url`}
          className="pl-8"
          value={embedded ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={embedded ? "Fichier importé depuis l'ordinateur" : "ou collez un lien https://..."}
        />
      </div>
    </div>
  );
};
