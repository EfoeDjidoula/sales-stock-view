import { useState, useMemo, useEffect } from "react";
import { formatCurrency } from "@/data/stationsData";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { useDashboardData, Period } from "@/hooks/useDashboardData";
import { ProfileMenu } from "@/components/ProfileMenu";
import { TenantSelector } from "@/components/tenant/TenantSelector";
import { CountrySwitcher } from "@/components/tenant/CountrySwitcher";
import { TenantSettingsModule } from "@/components/tenant/TenantSettingsModule";
import { useTenant } from "@/hooks/useTenant";
import { useBranding } from "@/hooks/useBranding";
import { useLanguage } from "@/hooks/useLanguage";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useModules } from "@/hooks/useModules";
import { useLicenseState } from "@/hooks/useLicenseState";
import { usePermissions } from "@/hooks/usePermissions";
import { LicenseBanner, LicenseBlockedScreen } from "@/components/license/LicenseBanner";

/** Onglets encore visibles en mode « accès limité » après expiration. */
const LIMITED_TABS = ["ventes", "stock", "historique"];
import { CommandCenter } from "@/components/command/CommandCenter";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { PeriodTabs } from "@/components/dashboard/PeriodTabs";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { SalesTrendByStation } from "@/components/dashboard/SalesTrendByStation";
import { StockModule } from "@/components/dashboard/StockModule";
import { StationCard } from "@/components/dashboard/StationCard";
import { OrdersModule } from "@/components/orders/OrdersModule";
import { AccessDenied } from "@/components/AccessDenied";
import { DepotageModule } from "@/components/depotage/DepotageModule";
import { TrucksModule } from "@/components/trucks/TrucksModule";
import { UsersModule } from "@/components/users/UsersModule";
import { StockEngineModule } from "@/components/stock/StockEngineModule";
import { SupplyWorkflowModule } from "@/components/supply/SupplyWorkflowModule";
import { SalesClosureModule } from "@/components/sales/SalesClosureModule";
import { ReconciliationModule } from "@/components/reconciliation/ReconciliationModule";
import { FraudCenterModule } from "@/components/fraud/FraudCenterModule";
import { StationManagement } from "@/components/stations/StationManagement";
import { FiscalYearModule } from "@/components/fiscal/FiscalYearModule";
import { HistoryModule } from "@/components/history/HistoryModule";
import { PerequationModule } from "@/components/perequation/PerequationModule";
import { ExcelImportDialog } from "@/components/import/ExcelImportDialog";
import { ExcelExportDialog } from "@/components/import/ExcelExportDialog";
import { DbStationSelector } from "@/components/dashboard/DbStationSelector";
import type { DbStation } from "@/components/dashboard/DbStationSelector";
import {
  LayoutDashboard,
  TrendingUp,
  Fuel,
  Package,
  Calendar,
  PenLine,
  FileText,
  History,
  Truck,
  Droplets,
  Users,
  Coins,
  Upload,
  Download,
  RefreshCw,
  BookOpen,
  BarChart3,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  Building2,
  Contact,
} from "lucide-react";
import { ClientsModule } from "@/components/clients/ClientsModule";
import { SuppliersModule } from "@/components/suppliers/SuppliersModule";
import { PriceStructureModule } from "@/components/pricing/PriceStructureModule";
import { ProformaModule } from "@/components/proforma/ProformaModule";
import { StationAnalysisModule } from "@/components/analysis/StationAnalysisModule";
import { SupportTickets } from "@/components/support/SupportTickets";
import { LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Define tab access by role
const TAB_PERMISSIONS: Record<string, AppRole[]> = {
  command: ["admin", "manager", "operator"],
  ventes: ["admin", "manager", "operator"],
  stock: ["admin", "manager", "operator"],
  moteur_stock: ["admin", "manager", "operator"],
  ventes_cloture: ["admin", "manager", "operator"],
  reconciliation: ["admin", "manager"],
  anti_fraude: ["admin", "manager"],
  historique: ["admin", "manager", "operator"],
  commandes: ["admin", "manager"],
  chaine_appro: ["admin", "manager", "operator"],
  perequation: ["admin", "manager", "operator"],
  stations: ["admin", "manager", "operator"],
  depotage: ["admin", "manager", "operator"],
  camions: ["admin", "manager", "operator"],
  clients: ["admin", "manager", "operator"],
  fournisseurs: ["admin", "manager", "operator"],
  structure_prix: ["admin", "manager"],
  proforma: ["admin", "manager", "operator"],
  analyse_ia: ["admin", "manager"],
  support: ["admin", "manager", "operator"],

  exercices: ["admin"],
  droits: ["admin"],
  societe: ["admin"],
};

// Metadata (label + icon) for each tab
const TAB_META: Record<string, { label: string; icon: typeof TrendingUp }> = {
  command: { label: "Command Center", icon: LayoutDashboard },
  ventes: { label: "Ventes", icon: TrendingUp },
  stock: { label: "Stock", icon: Package },
  moteur_stock: { label: "Mouvements de stock", icon: Package },
  ventes_cloture: { label: "Ventes & clôture", icon: BarChart3 },
  reconciliation: { label: "Réconciliation", icon: BarChart3 },
  anti_fraude: { label: "Anti-fraude & risques", icon: BarChart3 },
  historique: { label: "Historique", icon: History },
  commandes: { label: "Commandes", icon: FileText },
  chaine_appro: { label: "Appro. & réception", icon: Truck },
  depotage: { label: "Dépotages", icon: Droplets },
  camions: { label: "Camions", icon: Truck },
  stations: { label: "Stations", icon: LayoutDashboard },
  perequation: { label: "Péréquation", icon: Coins },
  structure_prix: { label: "Structure de prix", icon: Fuel },
  proforma: { label: "Proforma", icon: FileText },
  analyse_ia: { label: "Analyse IA", icon: BarChart3 },
  support: { label: "Mes tickets", icon: LifeBuoy },
  clients: { label: "Clients", icon: Users },
  fournisseurs: { label: "Fournisseurs", icon: Building2 },
  exercices: { label: "Exercices", icon: BookOpen },
  droits: { label: "Gestion des droits", icon: Users },
  societe: { label: "Paramètres client", icon: Building2 },
};

// Permission RBAC (au moins une) requise pour chaque onglet ; null = toujours visible
const TAB_RBAC: Record<string, string[] | null> = {
  command: ["dashboard.view"],
  ventes: ["dashboard.view", "index_entries.view"],
  stock: ["stock.view", "dashboard.view"],
  moteur_stock: ["stock.view"],
  ventes_cloture: ["sales.view"],
  reconciliation: ["reconciliation.view"],
  anti_fraude: ["fraud.view"],
  historique: ["index_entries.view"],
  commandes: ["orders.view"],
  chaine_appro: ["supplies.view"],
  depotage: ["depotages.view"],
  camions: ["trucks.view"],
  stations: ["stations.view"],
  perequation: ["perequation.view"],
  structure_prix: ["price_structures.view"],
  proforma: ["proforma.view"],
  analyse_ia: ["reports.view"],
  support: null,
  clients: ["clients.view"],
  fournisseurs: ["suppliers.view"],
  exercices: ["fiscal_years.view"],
  droits: ["users.view", "users.administer"],
  societe: ["settings.administer", "settings.edit"],
};

// Module (feature flag) requis pour chaque onglet
const TAB_MODULE: Record<string, string> = {
  ventes: "ventes",
  stock: "stocks",
  moteur_stock: "stocks",
  ventes_cloture: "ventes",
  reconciliation: "ventes",
  anti_fraude: "anti_fraude",
  historique: "index",
  commandes: "commandes",
  chaine_appro: "livraisons",
  depotage: "depots",
  camions: "livraisons",
  stations: "stations",
  perequation: "perequation",
  structure_prix: "facturation",
  proforma: "commandes",
  analyse_ia: "ia",
  clients: "clients_b2b",
  fournisseurs: "achats",
};

// Grouped navigation structure
const TAB_GROUPS: {
  id: string;
  label: string;
  icon: typeof TrendingUp;
  tabs: string[];
}[] = [
  { id: "suivi", label: "Suivi & Analyse", icon: BarChart3, tabs: ["command", "ventes", "ventes_cloture", "reconciliation", "anti_fraude", "stock", "moteur_stock", "historique", "analyse_ia"] },
  { id: "logistique", label: "Logistique & Flux", icon: Truck, tabs: ["commandes", "chaine_appro", "depotage", "camions"] },
  { id: "config", label: "Configuration", icon: Settings2, tabs: ["stations", "perequation", "structure_prix", "proforma"] },
  { id: "tiers", label: "Tiers", icon: Contact, tabs: ["clients", "fournisseurs"] },
  { id: "support", label: "Support", icon: LifeBuoy, tabs: ["support"] },
  { id: "admin", label: "Administration", icon: ShieldCheck, tabs: ["exercices", "droits", "societe"] },
];



const Index = () => {
  const [selectedStation, setSelectedStation] = useState<DbStation | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { currentUserRole, loading: roleLoading } = useUserRoles();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { can, permissions } = usePermissions();
  const canEnterIndex = can("index_entries", "create");
  const canExport = can("index_entries", "export") || can("reports", "export");
  const { tenant } = useTenant();
  const brand = useBranding();
  const { t, language } = useLanguage();
  const { isModuleEnabled, enabledMap, isLoading: modulesLoading } = useModules();
  const license = useLicenseState();
  const queryClient = useQueryClient();

  const { totalSales, totalSuper, totalGasoil, salesByStation, chartData, chartRawEntries, stations, isLoading, isFetching } =
    useDashboardData(period, selectedStation?.id);

  // Get allowed tabs for current user
  // Onglets affichés selon les permissions RBAC réelles (Super Admin : tout).
  // Repli sur l'ancien rôle uniquement si l'utilisateur n'a aucune permission RBAC.
  const allowedTabs = useMemo(() => {
    const hasRbac = permissions.size > 0;
    const base = isPlatformAdmin
      ? Object.keys(TAB_PERMISSIONS)
      : hasRbac
      ? Object.keys(TAB_PERMISSIONS).filter((tab) => {
          const perm = TAB_RBAC[tab];
          if (perm === null) return true;
          return (perm ?? []).some((p) => permissions.has(p));
        })
      : !currentUserRole
      ? ["ventes", "stock", "stations"]
      : Object.entries(TAB_PERMISSIONS)
          .filter(([_, roles]) => roles.includes(currentUserRole))
          .map(([tab]) => tab);
    return base.filter((tab) => {
      if (license.isLimited && !LIMITED_TABS.includes(tab)) return false;
      const moduleKey = TAB_MODULE[tab];
      return !moduleKey || isModuleEnabled(moduleKey);
    });
  }, [currentUserRole, enabledMap, license.isLimited, permissions, isPlatformAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "support" ? "support" : "command");

  const canAccessTab = (tab: string) => allowedTabs.includes(tab);

  // Un onglet devenu inaccessible (droits ou module désactivé) renvoie vers une section autorisée
  useEffect(() => {
    if (modulesLoading) return;
    if (canAccessTab(activeTab)) return;
    toast({
      variant: "destructive",
      title: "Section indisponible",
      description:
        "Cette section n'est pas activée pour votre société / pays ou vous n'y avez pas accès.",
    });
    if (allowedTabs.length > 0) setActiveTab(allowedTabs[0]);
  }, [activeTab, allowedTabs, modulesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (license.isBlocked) return <LicenseBlockedScreen />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 glow-primary overflow-hidden">
                {tenant?.logo_url ? (
                  <img
                    src={tenant.logo_url}
                    alt={`Logo ${tenant.trade_name || tenant.name}`}
                    className="w-7 h-7 object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Fuel className="w-7 h-7 text-primary" />
                )}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold">
                  {brand.companyName}
                </h1>
                <p className="text-sm text-muted-foreground">
                   {t("Tableau de bord - Gestion 2026")}
                </p>
              </div>
              <div className="hidden md:block h-8 w-px bg-border mx-1" />
              <div className="hidden md:block">
                <CountrySwitcher />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isPlatformAdmin && (
                <Button
                  asChild
                  variant="outline"
                  className="gap-2 border-indigo-500/50 text-indigo-400 hover:text-indigo-300"
                >
                  <Link to="/lumatek">
                    <ShieldAlert className="w-4 h-4" />
                    LUMATEK SaaS
                  </Link>
                </Button>
              )}
              <div className="md:hidden">
                <CountrySwitcher />
              </div>
              <TenantSelector />
              {canEnterIndex && (
                <ExcelImportDialog
                  trigger={
                    <Button variant="outline" className="gap-2">
                      <Upload className="w-4 h-4" />
                       {t("Importer")}
                    </Button>
                  }
                />
              )}
              {canExport && (
                <ExcelExportDialog
                  trigger={
                    <Button variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                       {t("Exporter")}
                    </Button>
                  }
                />
              )}
              {canEnterIndex && (
                <Link to="/saisie">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                    <PenLine className="w-4 h-4" />
                     {t("Saisie Index")}
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                className="gap-2"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true);
                  await queryClient.invalidateQueries({ queryKey: ["dashboard-entries"] });
                  await queryClient.invalidateQueries({ queryKey: ["dashboard-chart"] });
                  await queryClient.invalidateQueries({ queryKey: ["latest-jauge"] });
                  await queryClient.invalidateQueries({ queryKey: ["db-stations"] });
                  await queryClient.invalidateQueries({ queryKey: ["stock-jauges"] });
                  await queryClient.invalidateQueries({ queryKey: ["indexEntries"] });
                  await queryClient.invalidateQueries({ queryKey: ["orders"] });
                  await queryClient.invalidateQueries({ queryKey: ["supplies"] });
                  await queryClient.invalidateQueries({ queryKey: ["stations"] });
                  setIsRefreshing(false);
                   toast({ title: t("Données actualisées"), description: t("Toutes les données ont été rafraîchies.") });
                }}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                 {t("Actualiser")}
              </Button>
              <DbStationSelector
                selectedStation={selectedStation}
                onSelect={setSelectedStation}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary px-3 py-2 rounded-lg">
                <Calendar className="w-4 h-4" />
                <span>
                   {new Date().toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <ProfileMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <LicenseBanner />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap gap-2 bg-secondary rounded-lg p-1">
              {TAB_GROUPS.map((group) => {
                const visibleTabs = group.tabs.filter(canAccessTab);
                if (visibleTabs.length === 0) return null;
                const isGroupActive = visibleTabs.includes(activeTab);
                const activeMeta = isGroupActive ? TAB_META[activeTab] : null;
                const GroupIcon = group.icon;
                return (
                  <DropdownMenu key={group.id}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className={`gap-2 px-4 py-2 h-auto ${
                          isGroupActive
                            ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                            : "hover:bg-background/60"
                        }`}
                      >
                        <GroupIcon className="w-4 h-4" />
                         <span>{t(group.label)}</span>
                        {activeMeta && (
                           <span className="opacity-80">· {t(activeMeta.label)}</span>
                        )}
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                       <DropdownMenuLabel>{t(group.label)}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {visibleTabs.map((tab) => {
                        const meta = TAB_META[tab];
                        const ItemIcon = meta.icon;
                        return (
                          <DropdownMenuItem
                            key={tab}
                            onSelect={() => setActiveTab(tab)}
                            className={`gap-2 cursor-pointer ${
                              activeTab === tab ? "bg-accent text-accent-foreground" : ""
                            }`}
                          >
                            <ItemIcon className="w-4 h-4" />
                             {t(meta.label)}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </div>


            {activeTab === "ventes" && (
              <PeriodTabs selected={period} onSelect={setPeriod} />
            )}
          </div>

          {/* Ventes Tab */}
          {canAccessTab("command") && (
            <TabsContent value="command" className="animate-fade-in"><CommandCenter /></TabsContent>
          )}
          <TabsContent value="ventes" className="space-y-6 animate-fade-in">
            {isFetching ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-[360px] w-full rounded-xl" />
                <Skeleton className="h-[420px] w-full rounded-xl" />
                {!selectedStation && (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-64" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-44 w-full rounded-xl" />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SalesCard
                    title="Ventes totales"
                    value={formatCurrency(totalSales)}
                    subtitle={
                      period === "day"
                        ? "Aujourd'hui"
                        : period === "week"
                        ? "Cette semaine"
                        : "Ce mois"
                    }
                    icon={<TrendingUp className="w-5 h-5" />}
                    variant="primary"
                  />
                  <SalesCard
                    title="Super"
                    value={formatCurrency(totalSuper)}
                    subtitle={`${totalSales > 0 ? Math.round((totalSuper / totalSales) * 100) : 0}% du total`}
                    icon={<Fuel className="w-5 h-5" />}
                  />
                  <SalesCard
                    title="Gasoil"
                    value={formatCurrency(totalGasoil)}
                    subtitle={`${totalSales > 0 ? Math.round((totalGasoil / totalSales) * 100) : 0}% du total`}
                    icon={<Fuel className="w-5 h-5" />}
                  />
                </div>

                <SalesChart chartData={chartData} />

                <SalesTrendByStation rawChartEntries={chartRawEntries} stations={stations} />

                {!selectedStation && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-display font-semibold">
                      Performance par station
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stations.map((station) => {
                        const stationSales = salesByStation.get(station.id);
                        return (
                          <StationCard
                            key={station.id}
                            stationId={station.id}
                            name={station.name}
                            location={station.location}
                            totalSales={stationSales?.total || 0}
                            superJauge={stationSales?.superJauge || 0}
                            gasoilJauge={stationSales?.gasoilJauge || 0}
                            period={period}
                            onClick={() => setSelectedStation(station)}
                            isSelected={selectedStation?.id === station.id}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="anti_fraude" className="animate-fade-in">
            {canAccessTab("anti_fraude") ? <FraudCenterModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="reconciliation" className="animate-fade-in">
            {canAccessTab("reconciliation") ? <ReconciliationModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="ventes_cloture" className="animate-fade-in">
            {canAccessTab("ventes_cloture") ? <SalesClosureModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="moteur_stock" className="animate-fade-in">
            {canAccessTab("moteur_stock") ? <StockEngineModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="animate-fade-in">
            {canAccessTab("stock") ? (
              <StockModule stationId={selectedStation?.id} />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />
            )}
          </TabsContent>

          {/* Historique Tab */}
          <TabsContent value="historique" className="animate-fade-in">
            {canAccessTab("historique") ? (
              <HistoryModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />
            )}
          </TabsContent>

          {/* Commandes Tab */}
          <TabsContent value="commandes" className="animate-fade-in">
            {canAccessTab("commandes") ? (
              <OrdersModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          <TabsContent value="chaine_appro" className="animate-fade-in">
            {canAccessTab("chaine_appro") ? <SupplyWorkflowModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>

          {/* Dépotages Tab */}
          <TabsContent value="depotage" className="animate-fade-in">
            {canAccessTab("depotage") ? (
              <DepotageModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Camions Tab */}
          <TabsContent value="camions" className="animate-fade-in">
            {canAccessTab("camions") ? (
              <TrucksModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          <TabsContent value="clients" className="animate-fade-in">
            {canAccessTab("clients") ? (
              <ClientsModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          <TabsContent value="fournisseurs" className="animate-fade-in">
            {canAccessTab("fournisseurs") ? (
              <SuppliersModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>







          {/* Péréquation Tab */}
          <TabsContent value="perequation" className="animate-fade-in">
            {canAccessTab("perequation") ? (
              <PerequationModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Stations Tab */}
          <TabsContent value="stations" className="animate-fade-in">
            {canAccessTab("stations") ? (
              <StationManagement isAdmin={currentUserRole === "admin"} />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />
            )}
          </TabsContent>

          {/* Structure de prix Tab */}
          <TabsContent value="structure_prix" className="animate-fade-in">
            {canAccessTab("structure_prix") ? (
              <PriceStructureModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          <TabsContent value="support" className="animate-fade-in">
            <SupportTickets mode="client" />
          </TabsContent>

          {/* Analyse IA Tab */}
          <TabsContent value="analyse_ia" className="animate-fade-in">
            {canAccessTab("analyse_ia") ? (
              <StationAnalysisModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Proforma Tab */}
          <TabsContent value="proforma" className="animate-fade-in">
            {canAccessTab("proforma") ? (
              <ProformaModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Exercices Tab */}
          <TabsContent value="exercices" className="animate-fade-in">
            {canAccessTab("exercices") ? (
              <FiscalYearModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Gestion des droits Tab */}
          <TabsContent value="droits" className="animate-fade-in">
            {canAccessTab("droits") ? (
              <UsersModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Paramètres client (tenant) Tab */}
          <TabsContent value="societe" className="animate-fade-in">
            {canAccessTab("societe") ? (
              <TenantSettingsModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>
        </Tabs>

      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {brand.legalName}
            {brand.footerNote ? ` · ${brand.footerNote}` : ""}
          </p>
          {brand.poweredBy && (
            <p className="mt-1 text-xs opacity-70">{brand.poweredBy}</p>
          )}
        </div>
      </footer>
    </div>
  );
};

export default Index;
