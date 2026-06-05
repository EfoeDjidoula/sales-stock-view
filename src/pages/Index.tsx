import { useState, useMemo, useEffect } from "react";
import { formatCurrency } from "@/data/stationsData";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { useDashboardData, Period } from "@/hooks/useDashboardData";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { PeriodTabs } from "@/components/dashboard/PeriodTabs";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { SalesTrendByStation } from "@/components/dashboard/SalesTrendByStation";
import { StockModule } from "@/components/dashboard/StockModule";
import { StationCard } from "@/components/dashboard/StationCard";
import { OrdersModule } from "@/components/orders/OrdersModule";
import { AccessDenied } from "@/components/AccessDenied";
import { SuppliesModule } from "@/components/orders/SuppliesModule";
import { DepotageModule } from "@/components/depotage/DepotageModule";
import { TrucksModule } from "@/components/trucks/TrucksModule";
import { UsersModule } from "@/components/users/UsersModule";
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
} from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

// Define tab access by role
const TAB_PERMISSIONS: Record<string, AppRole[]> = {
  ventes: ["admin", "manager", "operator"],
  stock: ["admin", "manager", "operator"],
  historique: ["admin", "manager", "operator"],
  commandes: ["admin", "manager"],
  approvisionnements: ["admin", "manager"],
  perequation: ["admin", "manager", "operator"],
  stations: ["admin", "manager", "operator"],
  depotage: ["admin", "manager", "operator"],
  camions: ["admin", "manager", "operator"],

  exercices: ["admin"],
  droits: ["admin"],
};

const Index = () => {
  const [selectedStation, setSelectedStation] = useState<DbStation | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { currentUserRole, loading: roleLoading } = useUserRoles();
  const queryClient = useQueryClient();

  const { totalSales, totalSuper, totalGasoil, salesByStation, chartData, chartRawEntries, stations, isLoading, isFetching } =
    useDashboardData(period, selectedStation?.id);

  // Get allowed tabs for current user
  const allowedTabs = useMemo(() => {
    if (!currentUserRole) return ["ventes", "stock", "stations"];
    return Object.entries(TAB_PERMISSIONS)
      .filter(([_, roles]) => roles.includes(currentUserRole))
      .map(([tab]) => tab);
  }, [currentUserRole]);

  const [activeTab, setActiveTab] = useState("ventes");

  const canAccessTab = (tab: string) => allowedTabs.includes(tab);

  useEffect(() => {
    if (!canAccessTab(activeTab)) {
      toast({
        variant: "destructive",
        title: "Accès non autorisé",
        description: "Vous n'avez pas les permissions nécessaires pour accéder à cette section.",
      });
    }
  }, [activeTab, allowedTabs]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 glow-primary">
                <Fuel className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold">
                  YATT & CO ENERGY
                </h1>
                <p className="text-sm text-muted-foreground">
                  Tableau de bord - Gestion 2026
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ExcelImportDialog
                trigger={
                  <Button variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Importer
                  </Button>
                }
              />
              <ExcelExportDialog
                trigger={
                  <Button variant="outline" className="gap-2">
                    <Download className="w-4 h-4" />
                    Exporter
                  </Button>
                }
              />
              <Link to="/saisie">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                  <PenLine className="w-4 h-4" />
                  Saisie Index
                </Button>
              </Link>
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
                  toast({ title: "Données actualisées", description: "Toutes les données ont été rafraîchies." });
                }}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <DbStationSelector
                selectedStation={selectedStation}
                onSelect={setSelectedStation}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary px-3 py-2 rounded-lg">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date().toLocaleDateString("fr-FR", {
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="bg-secondary h-auto p-1 flex-wrap">
              {canAccessTab("ventes") && (
                <TabsTrigger
                  value="ventes"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Ventes
                </TabsTrigger>
              )}
              {canAccessTab("stock") && (
                <TabsTrigger
                  value="stock"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Package className="w-4 h-4" />
                  Stock
                </TabsTrigger>
              )}
              {canAccessTab("historique") && (
                <TabsTrigger
                  value="historique"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <History className="w-4 h-4" />
                  Historique
                </TabsTrigger>
              )}
              {canAccessTab("commandes") && (
                <TabsTrigger
                  value="commandes"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <FileText className="w-4 h-4" />
                  Commandes
                </TabsTrigger>
              )}
              {canAccessTab("approvisionnements") && (
                <TabsTrigger
                  value="approvisionnements"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Truck className="w-4 h-4" />
                  Approvisionnements
                </TabsTrigger>
              )}
              {canAccessTab("depotage") && (
                <TabsTrigger
                  value="depotage"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Droplets className="w-4 h-4" />
                  Dépotages
                </TabsTrigger>
              )}
              {canAccessTab("camions") && (
                <TabsTrigger
                  value="camions"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Truck className="w-4 h-4" />
                  Camions
                </TabsTrigger>
              )}
              {canAccessTab("perequation") && (
                <TabsTrigger
                  value="perequation"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Coins className="w-4 h-4" />
                  Péréquation
                </TabsTrigger>
              )}
              {canAccessTab("stations") && (
                <TabsTrigger
                  value="stations"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Stations
                </TabsTrigger>
              )}
              {canAccessTab("exercices") && (
                <TabsTrigger
                  value="exercices"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <BookOpen className="w-4 h-4" />
                  Exercices
                </TabsTrigger>
              )}
              {canAccessTab("droits") && (
                <TabsTrigger
                  value="droits"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Users className="w-4 h-4" />
                  Gestion des droits
                </TabsTrigger>
              )}
            </TabsList>

            {activeTab === "ventes" && (
              <PeriodTabs selected={period} onSelect={setPeriod} />
            )}
          </div>

          {/* Ventes Tab */}
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

          {/* Stock Tab */}
          <TabsContent value="stock" className="animate-fade-in">
            <StockModule stationId={selectedStation?.id} />
          </TabsContent>

          {/* Historique Tab */}
          <TabsContent value="historique" className="animate-fade-in">
            <HistoryModule />
          </TabsContent>

          {/* Commandes Tab */}
          <TabsContent value="commandes" className="animate-fade-in">
            {canAccessTab("commandes") ? (
              <OrdersModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Approvisionnements Tab */}
          <TabsContent value="approvisionnements" className="animate-fade-in">
            {canAccessTab("approvisionnements") ? (
              <SuppliesModule />
            ) : (
              <AccessDenied onGoBack={() => setActiveTab("ventes")} />
            )}
          </TabsContent>

          {/* Dépotages Tab */}
          <TabsContent value="depotage" className="animate-fade-in">
            {canAccessTab("depotage") ? (
              <DepotageModule />
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
            <StationManagement isAdmin={currentUserRole === "admin"} />
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
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 YATT & CO ENERGY BENIN SA - Système de Gestion des Stations</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
