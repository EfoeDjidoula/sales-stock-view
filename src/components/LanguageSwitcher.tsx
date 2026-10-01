import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

export const LanguageSwitcher = () => {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-md border border-border bg-background p-1" role="group" aria-label={t("Langue")}>
      <Globe2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {(["fr", "en"] as const).map((value) => (
        <Button key={value} type="button" size="sm" variant={language === value ? "secondary" : "ghost"}
          className="h-8 min-w-9 px-2 text-xs" aria-pressed={language === value}
          title={value === "fr" ? "Français" : "English"} onClick={() => setLanguage(value)}>
          {value.toUpperCase()}
        </Button>
      ))}
    </div>
  );
};
