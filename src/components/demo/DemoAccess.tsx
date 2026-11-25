import { BarChart3, Fuel, Truck, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startDemo } from "@/lib/demo/demoMode";
import type { DemoRole } from "@/lib/demo/demoData";

const PROFILES: { role: DemoRole; title: string; text: string; Icon: typeof Fuel }[] = [
  { role: "admin", title: "Directeur Général / Contrôleur", text: "Accès complet : Command Center, ventes, stocks, BI, B2B, réconciliation.", Icon: BarChart3 },
  { role: "operator", title: "Gérant de Station", text: "Saisie des index, jauges des cuves et clôture journalière.", Icon: Fuel },
  { role: "manager", title: "Superviseur Logistique & B2B", text: "Commandes, dépotages, stocks et facturation B2B.", Icon: Truck },
];

/** Accès démo en 1 clic, sans identifiant ni accès à la base réelle. */
export const DemoAccess = () => (
  <Card className="bg-card border-primary/40">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4 text-primary" /> Mode Démonstration & Formation</CardTitle>
      <CardDescription>Données simulées dans votre navigateur. Rien n'est enregistré.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-2">
      {PROFILES.map(({ role, title, text, Icon }) => (
        <Button key={role} variant="outline" className="h-auto justify-start gap-3 whitespace-normal py-2 text-left" onClick={() => void startDemo(role)}>
          <Icon className="h-5 w-5 shrink-0 text-primary" />
          <span><span className="block font-medium">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
        </Button>
      ))}
    </CardContent>
  </Card>
);
