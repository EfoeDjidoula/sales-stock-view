import { CalendarRange, ClipboardList, FileSpreadsheet, Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import ManagerAccount from "./ManagerAccount";
import AccountClosing from "./AccountClosing";

const NEXT: Record<string, { title: string; text: string }> = {
  ecap: {
    title: "Récapitulatifs ECAP hebdomadaire et mensuel",
    text: "Tableaux calqués sur vos modèles ECAP, avec export Excel et PDF. Prévu à l'étape 4.",
  },
  inventaire: {
    title: "Fiches d'inventaire périodiques",
    text: "Fiche d'inventaire par station selon votre modèle, à partir des jauges et index validés. Prévu à l'étape 4.",
  },
};

/** Menu « États de synthèse & Contrôle » : compte des gérants, arrêtés, récaps ECAP et inventaires. */
export default function SynthesisModule() {
  return (
    <Tabs defaultValue="compte" className="space-y-5">
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="compte" className="gap-2"><Scale className="w-4 h-4" />Compte des gérants</TabsTrigger>
        <TabsTrigger value="arrete" className="gap-2"><CalendarRange className="w-4 h-4" />Arrêté des comptes</TabsTrigger>
        <TabsTrigger value="ecap" className="gap-2"><FileSpreadsheet className="w-4 h-4" />Récaps ECAP</TabsTrigger>
        <TabsTrigger value="inventaire" className="gap-2"><ClipboardList className="w-4 h-4" />Fiches d'inventaire</TabsTrigger>
      </TabsList>
      <TabsContent value="compte"><ManagerAccount /></TabsContent>
      <TabsContent value="arrete"><AccountClosing /></TabsContent>
      {Object.entries(NEXT).map(([k, v]) => (
        <TabsContent key={k} value={k}>
          <Card className="glass-card"><CardContent className="py-10 text-center space-y-2">
            <p className="font-display text-lg font-semibold">{v.title}</p>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">{v.text}</p>
          </CardContent></Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
