import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Mode clair", Icon: Sun },
  { mode: "dark", label: "Mode sombre", Icon: Moon },
  { mode: "auto", label: "Automatique (sombre 19h–7h)", Icon: SunMoon },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  useEffect(() => {
    const h = () => setMode(getThemeMode());
    window.addEventListener("app-theme-change", h);
    return () => window.removeEventListener("app-theme-change", h);
  }, []);
  const Current = OPTIONS.find((o) => o.mode === mode)!.Icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Apparence" title="Apparence">
          <Current className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ mode: m, label, Icon }) => (
          <DropdownMenuItem key={m} onClick={() => setThemeMode(m)} className={m === mode ? "text-primary font-medium" : ""}>
            <Icon className="mr-2 h-4 w-4" />{label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
