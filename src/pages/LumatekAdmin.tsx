import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { AccessDenied } from "@/components/AccessDenied";
import { ProfileMenu } from "@/components/ProfileMenu";
import { LumatekDashboard } from "@/components/lumatek/LumatekDashboard";
import { LumatekClients } from "@/components/lumatek/LumatekClients";
import { LumatekUsers } from "@/components/lumatek/LumatekUsers";
import { LumatekCountries } from "@/components/lumatek/LumatekCountries";
import { LumatekModules } from "@/components/lumatek/LumatekModules";
import { LumatekPlaceholder } from "@/components/lumatek/LumatekPlaceholder";
import {
  LayoutDashboard,
  Building2,
  Users,
  Globe2,
  Blocks,
  KeyRound,
  FileSignature,
  LifeBuoy,
  ScrollText,
  Settings,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";

const MENU = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "utilisateurs", label: "Utilisateurs", icon: Users },
  { id: "pays", label: "Pays", icon: Globe2 },
  { id: "modules", label: "Modules", icon: Blocks },
  { id: "licences", label: "Licences", icon: KeyRound },
  { id: "contrats", label: "Contrats & Maintenance", icon: FileSignature },
  { id: "support", label: "Support", icon: LifeBuoy },
  { id: "journal", label: "Journal système", icon: ScrollText },
  { id: "parametres", label: "Paramètres", icon: Settings },
] as const;

type MenuId = (typeof MENU)[number]["id"];

const LumatekAdmin = () => {
  const { isPlatformAdmin, isLoading } = usePlatformAdmin();
  const [active, setActive] = useState<MenuId>("dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-background p-8">
        <AccessDenied />
      </div>
    );
  }

  const renderContent = () => {
    switch (active) {
      case "dashboard":
        return <LumatekDashboard />;
      case "clients":
        return <LumatekClients />;
      case "utilisateurs":
        return <LumatekUsers />;
      case "pays":
        return <LumatekCountries />;
      case "modules":
        return <LumatekModules />;
      case "licences":
        return (
          <LumatekPlaceholder
            title="Licences"
            description="Gestion des licences par client, quotas et dates d'expiration."
          />
        );
      case "contrats":
        return (
          <LumatekPlaceholder
            title="Contrats & Maintenance"
            description="Contrats commerciaux, niveaux de service et interventions de maintenance."
          />
        );
      case "support":
        return (
          <LumatekPlaceholder
            title="Support"
            description="Tickets, échanges avec les clients et suivi des incidents."
          />
        );
      case "journal":
        return (
          <LumatekPlaceholder
            title="Journal système"
            description="Traçabilité des actions sensibles réalisées sur la plateforme."
          />
        );
      case "parametres":
        return (
          <LumatekPlaceholder
            title="Paramètres de la plateforme"
            description="Paramètres globaux LUMATEK : branding, notifications et intégrations."
          />
        );
    }
  };

  const activeLabel = MENU.find((m) => m.id === active)?.label ?? "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Bandeau distinctif espace LUMATEK */}
      <header className="border-b border-indigo-500/30 bg-gradient-to-r from-indigo-950 via-slate-950 to-slate-950">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-500/20 p-2">
              <ShieldAlert className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">LUMATEK SaaS Administration</h1>
              <p className="text-xs text-slate-400">Espace Super Admin — accès transversal à tous les clients</p>
            </div>
            <Badge variant="outline" className="border-indigo-400/40 text-indigo-300">
              SUPER ADMIN
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2 border-indigo-500/40">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" /> Espace client
              </Link>
            </Button>
            <ProfileMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 lg:flex-row">
        <nav className="lg:w-64 shrink-0">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {MENU.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActive(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                    active === item.id
                      ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/40"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-4">
          <h2 className="text-xl font-semibold">{activeLabel}</h2>
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default LumatekAdmin;
