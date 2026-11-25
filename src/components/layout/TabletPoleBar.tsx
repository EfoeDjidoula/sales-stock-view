import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { ALL_NAV_GROUPS, formatBadge, poleBadgeTotal } from "@/lib/navigation";
import { CRITICAL_BADGES } from "@/hooks/useNavBadges";
import { useLanguage } from "@/hooks/useLanguage";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  tabMeta: Record<string, { label: string; icon: LucideIcon }>;
  canAccessTab: (tab: string) => boolean;
  activeTab: string;
  onSelect: (tab: string) => void;
  badges: Record<string, number>;
}

/** Barre des pôles en haut de l'écran, affichée sur tablette et smartphone (< 1280 px). */
export function TabletPoleBar({ tabMeta, canAccessTab, activeTab, onSelect, badges }: Props) {
  const { t } = useLanguage();
  return (
    <nav aria-label={t("Pôles métiers")} className="hidden md:flex xl:hidden gap-1.5 overflow-x-auto px-3 md:px-6 pb-2 scrollbar-none">
      {ALL_NAV_GROUPS.map((pole) => {
        const tabs = pole.tabs.filter((tab) => tabMeta[tab] && canAccessTab(tab));
        if (!tabs.length) return null;
        const total = poleBadgeTotal(pole, badges, canAccessTab);
        const critical = tabs.some((tab) => CRITICAL_BADGES.has(tab) && (badges[tab] ?? 0) > 0);
        const active = tabs.includes(activeTab);
        const Icon = pole.icon;
        return (
          <DropdownMenu key={pole.id}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "relative shrink-0 flex items-center gap-2 h-11 px-3 rounded-lg border text-sm font-medium transition-colors",
                  active ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="whitespace-nowrap">{pole.number ? `${pole.number}. ` : ""}{t(pole.label).split(/[,&]/)[0].trim()}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                {total > 0 && (
                  <span className={cn("absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-semibold leading-5 text-center",
                    critical ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}>
                    {formatBadge(total)}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t(pole.label)}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {tabs.map((tab) => {
                const meta = tabMeta[tab];
                const TabIcon = meta.icon;
                const n = badges[tab] ?? 0;
                return (
                  <DropdownMenuItem key={tab} className={cn("gap-2 h-11 cursor-pointer", tab === activeTab && "text-primary")} onSelect={() => onSelect(tab)}>
                    <TabIcon className="w-4 h-4" />
                    <span className="flex-1">{t(meta.label)}</span>
                    {n > 0 && (
                      <span className={cn("rounded-full px-1.5 text-[10px] font-semibold",
                        CRITICAL_BADGES.has(tab) ? "bg-destructive text-destructive-foreground" : "bg-primary/20 text-primary")}>
                        {formatBadge(n)}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
