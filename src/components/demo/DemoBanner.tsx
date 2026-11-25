import { FlaskConical, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exitDemo, getDemoRole, startDemo } from "@/lib/demo/demoMode";
import { DEMO_PROFILES, type DemoRole } from "@/lib/demo/demoData";

/** Bandeau persistant du mode démo : profil actif, bascule de profil, sortie. */
export const DemoBanner = () => {
  const role = getDemoRole();
  if (!role) return null;
  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/15 px-3 py-1.5 text-xs text-foreground backdrop-blur">
      <FlaskConical className="h-4 w-4 text-primary" />
      <span className="font-semibold">🧪 Mode Démo & Bac à sable (Données simulées)</span>
      <span className="text-muted-foreground hidden sm:inline">Profil :</span>
      <Select value={role} onValueChange={(r) => void startDemo(r as DemoRole)}>
        <SelectTrigger className="h-7 w-auto min-w-[200px] text-xs" aria-label="Changer de profil démo"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(DEMO_PROFILES) as DemoRole[]).map((r) => (
            <SelectItem key={r} value={r}>{DEMO_PROFILES[r].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => void exitDemo()}>
        <LogOut className="mr-1 h-3.5 w-3.5" /> Quitter le mode démo
      </Button>
    </div>
  );
};
