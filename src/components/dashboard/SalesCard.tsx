import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SalesCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: number;
  icon?: React.ReactNode;
  variant?: "default" | "primary" | "success" | "warning";
}

const variantStyles = {
  default: "bg-card border-border",
  primary: "bg-card border-primary/30 glow-primary",
  success: "bg-card border-success/30",
  warning: "bg-card border-warning/30",
};

export const SalesCard = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = "default",
}: SalesCardProps) => {
  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-success" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (trend === undefined) return "";
    if (trend > 0) return "text-success";
    if (trend < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-6 transition-all duration-300 hover:scale-[1.02] animate-fade-in",
        variantStyles[variant]
      )}
    >
      {/* Background glow effect */}
      {variant === "primary" && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/5 pointer-events-none" />
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          {icon && (
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-3xl font-display font-bold tracking-tight">
            {value}
          </p>

          {(subtitle || trend !== undefined) && (
            <div className="flex items-center gap-2">
              {trend !== undefined && (
                <div className={cn("flex items-center gap-1", getTrendColor())}>
                  {getTrendIcon()}
                  <span className="text-sm font-medium">
                    {Math.abs(trend)}%
                  </span>
                </div>
              )}
              {subtitle && (
                <span className="text-sm text-muted-foreground">{subtitle}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
