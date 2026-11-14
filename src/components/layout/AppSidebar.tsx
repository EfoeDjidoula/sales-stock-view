import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Fuel } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NAV_POLES, NAV_FOOTER, findPoleOfTab, formatBadge, poleBadgeTotal, type NavPole } from "@/lib/navigation";
import { CRITICAL_BADGES } from "@/hooks/useNavBadges";
import { useTenant } from "@/hooks/useTenant";
import { useBranding } from "@/hooks/useBranding";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  tabMeta: Record<string, { label: string; icon: LucideIcon }>;
  canAccessTab: (tab: string) => boolean;
  activeTab: string;
  onSelect: (tab: string) => void;
  badges: Record<string, number>;
}

const OPEN_KEY = "nav-open-poles";

const badgeClass = (tab: string) =>
  CRITICAL_BADGES.has(tab)
    ? "bg-destructive text-destructive-foreground"
    : "bg-primary/20 text-primary";

export function AppSidebar({ tabMeta, canAccessTab, activeTab, onSelect, badges }: AppSidebarProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { tenant } = useTenant();
  const brand = useBranding();
  const { t } = useLanguage();

  const [openPoles, setOpenPoles] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}");
    } catch {
      return {};
    }
  });

  // Le pôle de la section active reste toujours ouvert
  const activePole = findPoleOfTab(activeTab)?.id;
  useEffect(() => {
    if (activePole && openPoles[activePole] === false) setOpenPoles((p) => ({ ...p, [activePole]: true }));
  }, [activePole]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, JSON.stringify(openPoles));
  }, [openPoles]);

  const select = (tab: string) => {
    onSelect(tab);
    if (isMobile) setOpenMobile(false);
  };

  const renderItems = (tabs: string[]) => (
    <SidebarMenu>
      {tabs.map((tab) => {
        const meta = tabMeta[tab];
        if (!meta) return null;
        const Icon = meta.icon;
        const n = badges[tab] ?? 0;
        return (
          <SidebarMenuItem key={tab}>
            <SidebarMenuButton
              isActive={activeTab === tab}
              onClick={() => select(tab)}
              tooltip={t(meta.label)}
              className="data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-medium"
            >
              <Icon className="h-4 w-4" />
              <span>{t(meta.label)}</span>
            </SidebarMenuButton>
            {n > 0 && (
              <SidebarMenuBadge className={cn("rounded-full px-1.5 text-[10px] font-semibold", badgeClass(tab))}>
                {formatBadge(n)}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  const renderPole = (pole: NavPole) => {
    const visible = pole.tabs.filter(canAccessTab);
    if (visible.length === 0) return null;
    const open = collapsed || (openPoles[pole.id] ?? pole.id === activePole);
    const total = poleBadgeTotal(pole, badges, canAccessTab);
    const PoleIcon = pole.icon;
    const hasCritical = visible.some((tab) => CRITICAL_BADGES.has(tab) && (badges[tab] ?? 0) > 0);
    return (
      <Collapsible
        key={pole.id}
        open={open}
        onOpenChange={(o) => setOpenPoles((p) => ({ ...p, [pole.id]: o }))}
      >
        <SidebarGroup className="py-1">
          {!collapsed && (
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors",
                pole.id === activePole && "text-primary",
              )}
            >
              {pole.number !== null ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sidebar-border font-display text-[10px]">
                  {pole.number}
                </span>
              ) : (
                <PoleIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate text-left">{t(pole.label)}</span>
              {!open && total > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] normal-case tracking-normal",
                    hasCritical ? "bg-destructive text-destructive-foreground" : "bg-primary/20 text-primary",
                  )}
                >
                  {formatBadge(total)}
                </span>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !open && "-rotate-90")} />
            </CollapsibleTrigger>
          )}
          <CollapsibleContent>
            <SidebarGroupContent className={cn(!collapsed && "mt-0.5")}>{renderItems(visible)}</SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 glow-primary">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={`Logo ${brand.companyName}`} className="h-6 w-6 object-contain" loading="lazy" />
            ) : (
              <Fuel className="h-5 w-5 text-primary" />
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold leading-tight">{brand.companyName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/60">{t("Gestion du réseau")}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">{NAV_POLES.map(renderPole)}</SidebarContent>

      <SidebarFooter className="gap-0 border-t border-sidebar-border p-0 py-1">
        {NAV_FOOTER.map(renderPole)}
        {!collapsed && brand.poweredBy && (
          <>
            <SidebarSeparator />
            <p className="px-4 py-1.5 text-[10px] text-sidebar-foreground/50">{brand.poweredBy}</p>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
