import { BarChart3, CalendarRange, ClipboardList, FileSpreadsheet, Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ManagerAccount from "./ManagerAccount";
import AccountClosing from "./AccountClosing";
import EcapRecap from "./EcapRecap";
import InventorySheet from "./InventorySheet";
import NetworkSalesReport from "./NetworkSalesReport";

/** Menu « États de synthèse & Contrôle » : compte des gérants, arrêtés, récaps ECAP et inventaires. */
export default function SynthesisModule() {
  return (
    <Tabs defaultValue="compte" className="space-y-5" permissionMap={{ compte: "manager_accounts.view", arrete: "account_closings.view", ecap: "ecap_recaps.view", inventaire: "inventory_sheets.view", bilan: "network_sales.view" }}>
      <TabsList className="flex h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="compte" className="gap-2"><Scale className="w-4 h-4" />Compte des gérants</TabsTrigger>
        <TabsTrigger value="arrete" className="gap-2"><CalendarRange className="w-4 h-4" />Arrêté des comptes</TabsTrigger>
        <TabsTrigger value="ecap" className="gap-2"><FileSpreadsheet className="w-4 h-4" />Récaps ECAP</TabsTrigger>
        <TabsTrigger value="inventaire" className="gap-2"><ClipboardList className="w-4 h-4" />Fiches d'inventaire</TabsTrigger>
        <TabsTrigger value="bilan" className="gap-2"><BarChart3 className="w-4 h-4" />Bilan des ventes réseau</TabsTrigger>
      </TabsList>
      <TabsContent value="compte"><ManagerAccount /></TabsContent>
      <TabsContent value="arrete"><AccountClosing /></TabsContent>
      <TabsContent value="ecap"><EcapRecap /></TabsContent>
      <TabsContent value="inventaire"><InventorySheet /></TabsContent>
      <TabsContent value="bilan"><NetworkSalesReport /></TabsContent>
    </Tabs>
  );
}
