import { useState, useMemo, useEffect } from "react";
import {
  stations,
  Station,
  formatCurrency,
  getStationTotalSales,
  getAllStationsTotalSales,
} from "@/data/stationsData";
import { useUserRoles, AppRole } from "@/hooks/useUserRoles";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SalesCard } from "@/components/dashboard/SalesCard";
import { StationSelector } from "@/components/dashboard/StationSelector";
import { PeriodTabs } from "@/components/dashboard/PeriodTabs";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { StockModule } from "@/components/dashboard/StockModule";
import { StationCard } from "@/components/dashboard/StationCard";
import { OrdersModule } from "@/components/orders/OrdersModule";
import { AccessDenied } from "@/components/AccessDenied";
import { SuppliesModule } from "@/components/orders/SuppliesModule";
import { UsersModule } from "@/components/users/UsersModule";
import {
  LayoutDashboard,
  TrendingUp,
  Fuel,
  Package,
  Calendar,
  PenLine,
  FileText,
  Truck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Period = "day" | "week" | "month";

// Define tab access by role
const TAB_PERMISSIONS: Record<string, AppRole[]> = {
  ventes: ["admin", "manager", "operator"],
  stock: ["admin", "manager", "operator"],
  commandes: ["admin", "manager"],
  approvisionnements: ["admin", "manager"],
  stations: ["admin", "manager", "operator"],
  utilisateurs: ["admin"],
};

const Index = () => {
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const { currentUserRole, loading: roleLoading } = useUserRoles();
  
  // Get allowed tabs for current user
  const allowedTabs = useMemo(() => {
    if (!currentUserRole) return ["ventes", "stock", "stations"]; // Default for users without role
    return Object.entries(TAB_PERMISSIONS)
      .filter(([_, roles]) => roles.includes(currentUserRole))
      .map(([tab]) => tab);
  }, [currentUserRole]);

  const [activeTab, setActiveTab] = useState("ventes");

  // Helper to check if tab is allowed
  const canAccessTab = (tab: string) => allowedTabs.includes(tab);

  // Show toast when user navigates to unauthorized tab
  useEffect(() => {
    if (!canAccessTab(activeTab)) {
      toast({
        variant: "destructive",
        title: "Accès non autorisé",
        description: "Vous n'avez pas les permissions nécessaires pour accéder à cette section.",
      });
    }
  }, [activeTab, allowedTabs]);

  const getSuperSales = (station: Station | null) => {
    const stationsToCalc = station ? [station] : stations;
    return stationsToCalc.reduce((total, s) => {
      const records =
        period === "day"
          ? s.dailyRecords.slice(-1)
          : period === "week"
          ? s.dailyRecords.slice(-7)
          : s.dailyRecords;
      return (
        total +
        records.reduce((sum, r) => {
          const superProduct = r.products.find((p) => p.product === "SUPER");
          return sum + (superProduct?.amount || 0);
        }, 0)
      );
    }, 0);
  };

  const getGasoilSales = (station: Station | null) => {
    const stationsToCalc = station ? [station] : stations;
    return stationsToCalc.reduce((total, s) => {
      const records =
        period === "day"
          ? s.dailyRecords.slice(-1)
          : period === "week"
          ? s.dailyRecords.slice(-7)
          : s.dailyRecords;
      return (
        total +
        records.reduce((sum, r) => {
          const gasoilProduct = r.products.find((p) => p.product === "GASOIL");
          return sum + (gasoilProduct?.amount || 0);
        }, 0)
      );
    }, 0);
  };

  const totalSales = selectedStation
    ? getStationTotalSales(selectedStation, period)
    : getAllStationsTotalSales(period);

  const superSales = getSuperSales(selectedStation);
  const gasoilSales = getGasoilSales(selectedStation);

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
              <Link to="/saisie">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                  <PenLine className="w-4 h-4" />
                  Saisie Index
                </Button>
              </Link>
              <StationSelector
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
              {canAccessTab("stations") && (
                <TabsTrigger
                  value="stations"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Stations
                </TabsTrigger>
              )}
              {canAccessTab("utilisateurs") && (
                <TabsTrigger
                  value="utilisateurs"
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 px-4 py-2"
                >
                  <Users className="w-4 h-4" />
                  Utilisateurs
                </TabsTrigger>
              )}
            </TabsList>

            {activeTab === "ventes" && (
              <PeriodTabs selected={period} onSelect={setPeriod} />
            )}
          </div>

          {/* Ventes Tab */}
          <TabsContent value="ventes" className="space-y-6 animate-fade-in">
            {/* Sales Summary Cards */}
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
                trend={8.5}
                icon={<TrendingUp className="w-5 h-5" />}
                variant="primary"
              />
              <SalesCard
                title="Super"
                value={formatCurrency(superSales)}
                subtitle={`${Math.round((superSales / totalSales) * 100) || 0}% du total`}
                icon={<Fuel className="w-5 h-5" />}
              />
              <SalesCard
                title="Gasoil"
                value={formatCurrency(gasoilSales)}
                subtitle={`${Math.round((gasoilSales / totalSales) * 100) || 0}% du total`}
                icon={<Fuel className="w-5 h-5" />}
              />
            </div>

            {/* Sales Chart */}
            <SalesChart station={selectedStation} />

            {/* Quick Station Overview */}
            {!selectedStation && (
              <div className="space-y-4">
                <h2 className="text-lg font-display font-semibold">
                  Performance par station
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stations.slice(0, 6).map((station) => (
                    <StationCard
                      key={station.id}
                      station={station}
                      period={period}
                      onClick={() => setSelectedStation(station)}
                      isSelected={selectedStation?.id === station.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="animate-fade-in">
            <StockModule station={selectedStation} />
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

          {/* Stations Tab */}
          <TabsContent value="stations" className="animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-semibold">
                  Toutes les stations ({stations.length})
                </h2>
                <PeriodTabs selected={period} onSelect={setPeriod} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stations.map((station) => (
                  <StationCard
                    key={station.id}
                    station={station}
                    period={period}
                    onClick={() => {
                      setSelectedStation(station);
                      setActiveTab("ventes");
                    }}
                    isSelected={selectedStation?.id === station.id}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Utilisateurs Tab */}
          <TabsContent value="utilisateurs" className="animate-fade-in">
            {canAccessTab("utilisateurs") ? (
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
