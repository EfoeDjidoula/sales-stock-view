import ProSuiteModule from "@/components/pro/ProSuiteModule";
import PeriodicReportsModule from "@/components/reports/PeriodicReportsModule";
import WorkflowModule from "@/components/workflow/WorkflowModule";
import HseModule from "@/components/hse/HseModule";
import AssetsMaintenanceModule from "@/components/maintenance/AssetsMaintenanceModule";
import { useState, useMemo, useEffect, useRef, type CSSProperties } from "react";
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
import { BiModule } from "@/components/bi/BiModule";
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
import { LogisticsModule } from "@/components/logistics/LogisticsModule";
import { SupplyWorkflowModule } from "@/components/supply/SupplyWorkflowModule";
import { SalesClosureModule } from "@/components/sales/SalesClosureModule";
import { ReconciliationModule } from "@/components/reconciliation/ReconciliationModule";
import { FraudCenterModule } from "@/components/fraud/FraudCenterModule";
import { FuelCardsModule } from "@/components/fuel/FuelCardsModule";
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
  CreditCard,
} from "lucide-react";
import { ClientsModule } from "@/components/clients/ClientsModule";
import { B2BModule } from "@/components/clients/B2BModule";
import { SuppliersModule } from "@/components/suppliers/SuppliersModule";
import { PriceStructureModule } from "@/components/pricing/PriceStructureModule";
import { ProformaModule } from "@/components/proforma/ProformaModule";
import { StationAnalysisModule } from "@/components/analysis/StationAnalysisModule";
import { SupportTickets } from "@/components/support/SupportTickets";
import { LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { findPoleOfTab, formatBadge } from "@/lib/navigation";
import { useNavBadges, CRITICAL_BADGES } from "@/hooks/useNavBadges";
import { Bell, MoreHorizontal } from "lucide-react";
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
  bi: ["admin", "manager"],
  ventes: ["admin", "manager", "operator"],
  stock: ["admin", "manager", "operator"],
  moteur_stock: ["admin", "manager", "operator"],
  ventes_cloture: ["admin", "manager", "operator"],
  reconciliation: ["admin", "manager"],
  anti_fraude: ["admin", "manager"],
  historique: ["admin", "manager", "operator"],
  commandes: ["admin", "manager"],
  chaine_appro: ["admin", "manager", "operator"],
  logistique_avancee: ["admin", "manager", "operator"],
  perequation: ["admin", "manager", "operator"],
  stations: ["admin", "manager", "operator"],
  maintenance: ["admin", "manager", "operator"],
  hse: ["admin", "manager", "operator"],
  depotage: ["admin", "manager", "operator"],
  camions: ["admin", "manager", "operator"],
  clients: ["admin", "manager", "operator"],
  b2b: ["admin", "manager", "operator"],
  fournisseurs: ["admin", "manager", "operator"],
  structure_prix: ["admin", "manager"],
  proforma: ["admin", "manager", "operator"],
  analyse_ia: ["admin", "manager"],
  support: ["admin", "manager", "operator"],
  fuel_cards: ["admin", "manager", "operator"],

  exercices: ["admin"],
  droits: ["admin"],
  societe: ["admin"],
  workflows: ["admin", "manager"],
  suite_pro: ["admin", "manager"],
  rapports: ["admin", "manager"],
};

// Metadata (label + icon) for each tab
const TAB_META: Record<string, { label: string; icon: typeof TrendingUp }> = {
  command: { label: "Command Center", icon: LayoutDashboard },
  bi: { label: "BI avancée", icon: BarChart3 },
  ventes: { label: "Ventes", icon: TrendingUp },
  stock: { label: "Stock", icon: Package },
  moteur_stock: { label: "Mouvements de stock", icon: Package },
  ventes_cloture: { label: "Ventes & clôture", icon: BarChart3 },
  reconciliation: { label: "Réconciliation", icon: BarChart3 },
  anti_fraude: { label: "Anti-fraude & risques", icon: BarChart3 },
  historique: { label: "Historique", icon: History },
  commandes: { label: "Commandes", icon: FileText },
  chaine_appro: { label: "Appro. & réception", icon: Truck },
  logistique_avancee: { label: "Chaîne logistique & appro", icon: Truck },
  depotage: { label: "Dépotages", icon: Droplets },
  camions: { label: "Camions", icon: Truck },
  stations: { label: "Stations", icon: LayoutDashboard },
  maintenance: { label: "Assets & Maintenance", icon: Settings2 },
  hse: { label: "HSE & Conformité", icon: ShieldCheck },
  perequation: { label: "Péréquation", icon: Coins },
  structure_prix: { label: "Structure de prix", icon: Fuel },
  proforma: { label: "Proforma", icon: FileText },
  analyse_ia: { label: "Analyse IA", icon: BarChart3 },
  support: { label: "Mes tickets", icon: LifeBuoy },
  clients: { label: "Clients", icon: Users },
  b2b: { label: "Clients B2B", icon: Contact },
  fuel_cards: { label: "Cartes carburant", icon: CreditCard },
  fournisseurs: { label: "Fournisseurs", icon: Building2 },
  exercices: { label: "Exercices", icon: BookOpen },
  droits: { label: "Gestion des droits", icon: Users },
  societe: { label: "Paramètres client", icon: Building2 },
  workflows: { label: "Workflows & approbations", icon: ShieldCheck },
  suite_pro: { label: "Suite Pro", icon: FileText },
  rapports: { label: "Rapports périodiques", icon: FileText },
};

// Permission RBAC (au moins une) requise pour chaque onglet ; null = toujours visible
const TAB_RBAC: Record<string, string[] | null> = {
  command: ["dashboard.view"],
  bi: ["reports.view"],
  ventes: ["dashboard.view", "index_entries.view"],
  stock: ["stock.view", "dashboard.view"],
  moteur_stock: ["stock.view"],
  ventes_cloture: ["sales.view"],
  reconciliation: ["reconciliation.view"],
  anti_fraude: ["fraud.view"],
  historique: ["index_entries.view"],
  commandes: ["orders.view"],
  chaine_appro: ["supplies.view"],
  logistique_avancee: ["supplies.view"],
  depotage: ["depotages.view"],
  camions: ["trucks.view"],
  stations: ["stations.view"],
  maintenance: ["stations.view"],
  hse: ["stations.view"],
  perequation: ["perequation.view"],
  structure_prix: ["price_structures.view"],
  proforma: ["proforma.view"],
  analyse_ia: ["reports.view"],
  support: null,
  clients: ["clients.view"],
  b2b: ["clients.view"],
  fuel_cards: ["fuel_cards.view"],
  fournisseurs: ["suppliers.view"],
  exercices: ["fiscal_years.view"],
  droits: ["users.view", "users.administer"],
  societe: ["settings.administer", "settings.edit"],
  workflows: ["workflows.view", "workflows.manage"],
  suite_pro: ["reports.view"],
  rapports: ["reports.view"],
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
  logistique_avancee: "livraisons",
  depotage: "depots",
  camions: "livraisons",
  stations: "stations",
  maintenance: "stations",
  hse: "stations",
  perequation: "perequation",
  structure_prix: "facturation",
  proforma: "commandes",
  analyse_ia: "ia",
  clients: "clients_b2b",
  b2b: "clients_b2b",
  fuel_cards: "cartes_carburant",
  fournisseurs: "achats",
};

// Modules dédiés du catalogue SaaS : leur désactivation masque aussi l'onglet
const TAB_EXTRA_MODULE: Record<string, string> = {
  command: "command_center",
  bi: "bi",
  ventes_cloture: "cloture",
  moteur_stock: "moteur_stock",
  reconciliation: "reconciliation",
  logistique_avancee: "logistique",
  maintenance: "maintenance",
  hse: "hse",
  workflows: "workflows",
  proforma: "proforma",
  exercices: "exercices",
  support: "support",
};

const Index = () => {
  const [selectedStation, setSelectedStation] = useState<DbStation | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { currentUserRole, loading: roleLoading } = useUserRoles();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { can, permissions, isLoading: permsLoading } = usePermissions();
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
      const keys = [TAB_MODULE[tab], TAB_EXTRA_MODULE[tab]].filter(Boolean) as string[];
      return keys.every((k) => isModuleEnabled(k));
    });
  }, [currentUserRole, enabledMap, license.isLimited, permissions, isPlatformAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    return fromUrl && fromUrl in TAB_META ? fromUrl : "command";
  });
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Onglet par défaut (non choisi) : redirection silencieuse vers la première section autorisée
  const tabIsDefault = useRef(true);
  const selectTab = (tab: string) => { tabIsDefault.current = false; setActiveTab(tab); };

  // La section active est reflétée dans l'adresse (?tab=) pour le partage et le retour arrière
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === activeTab) return;
    url.searchParams.set("tab", activeTab);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [activeTab]);

  const canAccessTab = (tab: string) => allowedTabs.includes(tab);
  const { data: badges = {} } = useNavBadges(canAccessTab);

  // Un onglet devenu inaccessible (droits ou module désactivé) renvoie vers une section autorisée
  useEffect(() => {
    if (modulesLoading || roleLoading || permsLoading || license.isLoading) return;
    if (canAccessTab(activeTab)) return;
    if (!tabIsDefault.current) {
      toast({
        variant: "destructive",
        title: "Section indisponible",
        description:
          "Cette section n'est pas activée pour votre société / pays ou vous n'y avez pas accès.",
      });
    }
    if (allowedTabs.length > 0) setActiveTab(allowedTabs[0]);
  }, [activeTab, allowedTabs, modulesLoading, roleLoading, permsLoading, license.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (license.isBlocked) return <LicenseBlockedScreen />;

  const currentPole = findPoleOfTab(activeTab);
  const currentMeta = TAB_META[activeTab];
  const alertEntries = Object.entries(badges).filter(([tab, n]) => n > 0 && canAccessTab(tab));
  const alertTotal = alertEntries.reduce((sum, [, n]) => sum + n, 0);

  const refreshAll = async () => {
    setIsRefreshing(true);
    for (const key of ["dashboard-entries", "dashboard-chart", "latest-jauge", "db-stations", "stock-jauges", "indexEntries", "orders", "supplies", "stations", "nav-badges"]) {
      await queryClient.invalidateQueries({ queryKey: [key] });
    }
    setIsRefreshing(false);
    toast({ title: t("Données actualisées"), description: t("Toutes les données ont été rafraîchies.") });
  };

  return (
    <SidebarProvider
      defaultOpen={!document.cookie.includes("sidebar:state=false")}
      style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
    >
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar
          tabMeta={TAB_META}
          canAccessTab={canAccessTab}
          activeTab={activeTab}
          onSelect={selectTab}
          badges={badges}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* En-tête épuré : fil d'Ariane, contexte, actions */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 md:px-6 py-2.5">
              <SidebarTrigger className="shrink-0" aria-label={t("Afficher / masquer le menu")} />
              <div className="hidden sm:block h-6 w-px bg-border" />
              <nav aria-label="Fil d'Ariane" className="min-w-[10rem] flex-1">
                <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                  {currentPole ? `${currentPole.number ? `${currentPole.number} · ` : ""}${t(currentPole.label)}` : brand.companyName}
                </p>
                <h1 className="truncate font-display text-base md:text-lg font-semibold leading-tight">
                  {currentMeta ? t(currentMeta.label) : brand.companyName}
                </h1>
              </nav>

              <div className="order-last flex w-full flex-wrap items-center gap-2 2xl:order-none 2xl:w-auto">
                <CountrySwitcher />
                <TenantSelector />
                <DbStationSelector selectedStation={selectedStation} onSelect={setSelectedStation} />
                <div className="hidden 2xl:flex items-center gap-2 text-sm text-muted-foreground bg-secondary px-3 py-2 rounded-lg">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {new Date().toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                {isPlatformAdmin && (
                  <Button asChild variant="outline" size="sm" className="gap-2 border-primary/40 text-primary hover:text-primary">
                    <Link to="/lumatek" title="LUMATEK SaaS">
                      <ShieldAlert className="w-4 h-4" />
                      <span className="hidden lg:inline">LUMATEK SaaS</span>
                    </Link>
                  </Button>
                )}
                {canEnterIndex && (
                  <Button asChild size="sm" className="gap-2">
                    <Link to="/saisie">
                      <PenLine className="w-4 h-4" />
                      <span className="hidden sm:inline">{t("Saisie Index")}</span>
                    </Link>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <MoreHorizontal className="w-4 h-4" />
                      <span className="hidden md:inline">{t("Actions")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {canEnterIndex && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onSelect={() => setImportOpen(true)}>
                        <Upload className="w-4 h-4" /> {t("Importer")}
                      </DropdownMenuItem>
                    )}
                    {canExport && (
                      <DropdownMenuItem className="gap-2 cursor-pointer" onSelect={() => setExportOpen(true)}>
                        <Download className="w-4 h-4" /> {t("Exporter")}
                      </DropdownMenuItem>
                    )}
                    {(canEnterIndex || canExport) && <DropdownMenuSeparator />}
                    <DropdownMenuItem className="gap-2 cursor-pointer" disabled={isRefreshing} onSelect={() => void refreshAll()}>
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} /> {t("Actualiser")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={t("Alertes en attente")}>
                      <Bell className="w-4 h-4" />
                      {alertTotal > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-4 text-center">
                          {formatBadge(alertTotal)}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>{t("Alertes en attente")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {alertEntries.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">{t("Aucune alerte en attente")}</div>
                    ) : (
                      alertEntries.map(([tab, n]) => {
                        const meta = TAB_META[tab];
                        const Icon = meta.icon;
                        return (
                          <DropdownMenuItem key={tab} className="gap-2 cursor-pointer" onSelect={() => selectTab(tab)}>
                            <Icon className="w-4 h-4" />
                            <span className="flex-1">{t(meta.label)}</span>
                            <span className={`rounded-full px-1.5 text-[10px] font-semibold ${CRITICAL_BADGES.has(tab) ? "bg-destructive text-destructive-foreground" : "bg-primary/20 text-primary"}`}>
                              {formatBadge(n)}
                            </span>
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ProfileMenu />
              </div>
            </div>
          </header>
          {canEnterIndex && <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />}
          {canExport && <ExcelExportDialog open={exportOpen} onOpenChange={setExportOpen} />}

          {/* Main Content */}
          <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 md:px-6 py-6">
            <LicenseBanner />
            <Tabs value={activeTab} onValueChange={selectTab} className="space-y-6">
              {activeTab === "ventes" && (
                <div className="flex justify-end">
                  <PeriodTabs selected={period} onSelect={setPeriod} />
                </div>
              )}

          {/* Ventes Tab */}
          {canAccessTab("command") && (
            <TabsContent value="command" className="animate-fade-in"><CommandCenter /></TabsContent>
          )}
          <TabsContent value="bi" className="animate-fade-in">{canAccessTab("bi") ? <BiModule /> : <AccessDenied onGoBack={() => setActiveTab("command")} />}</TabsContent>
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

          <TabsContent value="maintenance" className="animate-fade-in">
            {canAccessTab("maintenance") ? <AssetsMaintenanceModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="workflows" className="animate-fade-in">
            {canAccessTab("workflows") ? <WorkflowModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="hse" className="animate-fade-in">
            {canAccessTab("hse") ? <HseModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>
          <TabsContent value="logistique_avancee" className="animate-fade-in">
            {canAccessTab("logistique_avancee") ? <LogisticsModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
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

          <TabsContent value="fuel_cards" className="animate-fade-in">
            {canAccessTab("fuel_cards") ? <FuelCardsModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
          </TabsContent>

          <TabsContent value="b2b" className="animate-fade-in">
            {canAccessTab("b2b") ? <B2BModule /> : <AccessDenied onGoBack={() => setActiveTab(allowedTabs[0] ?? "ventes")} />}
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

          <TabsContent value="rapports" className="animate-fade-in">
            {canAccessTab("rapports") ? <PeriodicReportsModule /> : <AccessDenied onGoBack={() => setActiveTab("ventes")} />}
          </TabsContent>
          <TabsContent value="suite_pro" className="animate-fade-in">
            {canAccessTab("suite_pro") ? <ProSuiteModule /> : <AccessDenied onGoBack={() => setActiveTab("ventes")} />}
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
          <footer className="border-t border-border py-4">
            <div className="px-3 md:px-6 text-center text-xs text-muted-foreground">
              <p>
                © {new Date().getFullYear()} {brand.legalName}
                {brand.footerNote ? ` · ${brand.footerNote}` : ""}
              </p>
            </div>
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
