import { cn } from "@/lib/utils";

type Period = "day" | "week" | "month";

interface PeriodTabsProps {
  selected: Period;
  onSelect: (period: Period) => void;
}

const periods: { value: Period; label: string }[] = [
  { value: "day", label: "Aujourd'hui" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
];

export const PeriodTabs = ({ selected, onSelect }: PeriodTabsProps) => {
  return (
    <div className="inline-flex bg-secondary rounded-lg p-1">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onSelect(period.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-all duration-200",
            selected === period.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};
