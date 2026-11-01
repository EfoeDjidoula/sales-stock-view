import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const count = async (table: string) => {
  const { count: c } = await (supabase as any).from(table).select("*", { count: "exact", head: true });
  return c ?? 0;
};

/** Carte de navigation : chaque écran et le chemin pour l'atteindre. */
const NAV_MAP: { screen: string; path: string }[] = [
  { screen: "Command Center", path: "Tableau de bord → Suivi & Analyse → Command Center" },
  { screen: "BI avancée (prévisions, IA appro, Assistant IA)", path: "Suivi & Analyse → BI avancée → onglets Prévisions / IA appro & transports / Assistant" },
  { screen: "Ventes & clôture journalière", path: "Suivi & Analyse → Ventes & clôture" },
  { screen: "Réconciliation", path: "Suivi & Analyse → Réconciliation" },
  { screen: "Anti-fraude & Risk Score", path: "Suivi & Analyse → Anti-fraude & risques" },
  { screen: "Mouvements de stock (registre, transferts, inventaires)", path: "Suivi & Analyse → Mouvements de stock" },
  { screen: "Analyse IA station", path: "Suivi & Analyse → Analyse IA (module IA à activer)" },
  { screen: "Chaîne logistique & appro (transporteurs, flotte, missions, carte GPS, check-in, suivi station)", path: "Logistique & Flux → Chaîne logistique & appro" },
  { screen: "Dépotages", path: "Logistique & Flux → Dépotages" },
  { screen: "Référentiels (produits, dépôts, cuves, pompes, pistolets)", path: "Configuration → Stations → Référentiels" },
  { screen: "Assets & Maintenance (KPI disponibilité/coût)", path: "Configuration → Assets & Maintenance" },
  { screen: "HSE & Conformité, Agents HSE", path: "Configuration → HSE & Conformité → Agents HSE" },
  { screen: "Clients B2B, Cartes carburant", path: "Tiers → Clients B2B / Cartes carburant" },
  { screen: "Workflows & approbations", path: "Administration → Workflows & approbations" },
  { screen: "Saisie des index", path: "Tableau de bord → bouton « Saisie des index »" },
  { screen: "Mes tickets", path: "Support → Mes tickets" },
  { screen: "API Hub, Intégrations, Journal système", path: "Super Admin (/lumatek) → menu de gauche" },
];

export const LumatekSettings = () => {
  const { data } = useQuery({
    queryKey: ["lumatek-settings-summary"],
    queryFn: async () => {
      const [tenants, countries, modules, plans] = await Promise.all([
        count("tenants"), count("countries"), count("modules"), count("license_plans"),
      ]);
      return { tenants, countries, modules, plans };
    },
  });

  const rows: [string, string][] = [
    ["Politique mot de passe (création de comptes)", "6 à 8 caractères maximum, vérifiée à l'écran et côté serveur"],
    ["Inscription publique", "Désactivée — comptes créés par un administrateur"],
    ["Langues", "Français (source), Anglais — choix par utilisateur"],
    ["Domaine email", "notify.lumatek.com"],
    ["SLA support", "Critique 4 h · Haute 8 h · Normale 24 h · Faible 72 h"],
    ["Alertes licence", "J-60, J-30, J-15, J-7, Jour J ; lecture seule après la grâce"],
    ["Alertes contrats", "J-90, J-60, J-30, J-15, J-7"],
    ["Seuils stock", "Faible 25 % · Critique 10 % de la capacité ; tolérance inventaire ±0,5 %"],
    ["Réconciliation", "Volumes 0,3 / 0,5 / 1 % · Montants 5 000 / 20 000 / 100 000 FCFA"],
    ["Crédit B2B", "Alertes 70 / 80 / 90 / 100 % du plafond"],
    ["Synchronisations intégrations", "Planificateur horaire, intervalles 1 h à 24 h"],
    ["Suppression automatique de données", "Jamais (y compris à l'expiration de licence)"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Clients", data?.tenants], ["Pays", data?.countries], ["Modules", data?.modules], ["Plans de licence", data?.plans]].map(([l, v]) => (
          <Card key={String(l)}><CardContent className="pt-6"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v ?? "…"}</p></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Règles de la plateforme</CardTitle><CardDescription>Paramètres globaux appliqués à tous les clients.</CardDescription></CardHeader>
        <CardContent>
          <Table><TableBody>{rows.map(([k, v]) => <TableRow key={k}><TableCell className="font-medium">{k}</TableCell><TableCell>{v}</TableCell></TableRow>)}</TableBody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Plan de navigation</CardTitle><CardDescription>Où trouver chaque écran ajouté depuis le début du projet.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Écran</TableHead><TableHead>Chemin</TableHead></TableRow></TableHeader>
            <TableBody>{NAV_MAP.map((n) => <TableRow key={n.screen}><TableCell>{n.screen}</TableCell><TableCell><Badge variant="outline">{n.path}</Badge></TableCell></TableRow>)}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
