import { cn } from "@/lib/utils";
import { formatNumber } from "@/data/stationsData";
import { useEffect, useRef, useState } from "react";

interface StockGaugeProps {
  tank: string;
  capacity: number;
  currentStock: number;
  product: "super" | "gasoil";
}

/** Smoothly tweens a numeric value with requestAnimationFrame, reacting
 *  instantly to live (realtime) prop changes without perceptible lag. */
const useTweenedValue = (target: number, duration = 700) => {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return;

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(from + delta * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
};

export const StockGauge = ({ tank, capacity, currentStock, product }: StockGaugeProps) => {
  const animatedStock = useTweenedValue(currentStock);
  const percentage = capacity > 0 ? Math.round((currentStock / capacity) * 100) : 0;
  const animatedPct = capacity > 0 ? (animatedStock / capacity) * 100 : 0;
  const clamped = Math.min(Math.max(animatedPct, 0), 100);

  const getStatusText = () => {
    if (percentage <= 20) return "Critique";
    if (percentage <= 40) return "Bas";
    if (percentage <= 70) return "Moyen";
    return "Bon";
  };

  // Liquid color follows the product; the status only tints badges/glow.
  const liquidVar = product === "super" ? "var(--super)" : "var(--gasoil)";
  const statusVar =
    percentage <= 20 ? "var(--destructive)" : percentage <= 40 ? "var(--warning)" : "var(--success)";


  return (
    <div className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">{tank}</p>
          <span
            className={cn(
              "inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium",
              product === "super" ? "bg-super/20 text-super" : "bg-gasoil/20 text-gasoil"
            )}
          >
            {product === "super" ? "Super" : "Gasoil"}
          </span>
        </div>
        <span
          className={cn(
            "px-2 py-1 rounded-md text-xs font-semibold",
            percentage <= 20
              ? "bg-destructive/20 text-destructive"
              : percentage <= 40
              ? "bg-warning/20 text-warning"
              : "bg-success/20 text-success"
          )}
        >
          {getStatusText()}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* 3D cylindrical tank */}
        <div className="tank-3d shrink-0">
          <div
            className="relative"
            style={{ width: 84, height: 120, transformStyle: "preserve-3d", transform: "rotateX(6deg)" }}
          >
            {/* Cylinder body with curved side shading */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                borderRadius: "42px / 18px",
                background:
                  "linear-gradient(90deg, hsl(var(--background)) 0%, hsl(217 33% 22%) 22%, hsl(217 33% 30%) 50%, hsl(217 33% 22%) 78%, hsl(var(--background)) 100%)",
                boxShadow: `inset 0 0 14px hsl(0 0% 0% / 0.5), 0 8px 18px -6px hsl(${liquidVar} / 0.4)`,
                border: "1px solid hsl(var(--border))",
              }}
            >
              {/* Liquid fill — height driven per-frame for lag-free realtime sync */}
              <div
                className="absolute left-0 right-0 bottom-0 overflow-hidden"
                style={{ height: `${clamped}%` }}
              >

                {/* base liquid with vertical sheen */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, hsl(${liquidVar} / 0.55) 0%, hsl(${liquidVar}) 35%, hsl(${liquidVar}) 65%, hsl(${liquidVar} / 0.55) 100%)`,
                  }}
                />
                {/* moving wave surfaces */}
                <div
                  className="tank-3d__wave--back absolute -top-2 left-0 h-4"
                  style={{
                    width: "200%",
                    background: `radial-gradient(ellipse 24px 8px at 12px 8px, hsl(${liquidVar} / 0.7) 50%, transparent 52%) repeat-x`,
                    backgroundSize: "48px 16px",
                    opacity: 0.6,
                  }}
                />
                <div
                  className="tank-3d__wave absolute -top-1.5 left-0 h-3"
                  style={{
                    width: "200%",
                    background: `radial-gradient(ellipse 20px 6px at 10px 6px, hsl(${liquidVar}) 50%, transparent 52%) repeat-x`,
                    backgroundSize: "40px 12px",
                  }}
                />
                {/* rising bubbles */}
                <span
                  className="tank-3d__bubble absolute bottom-1 left-[30%] w-1 h-1 rounded-full"
                  style={{ background: "hsl(0 0% 100% / 0.6)", animationDelay: "0.2s" }}
                />
                <span
                  className="tank-3d__bubble absolute bottom-1 left-[55%] w-1.5 h-1.5 rounded-full"
                  style={{ background: "hsl(0 0% 100% / 0.5)", animationDelay: "1.4s" }}
                />
                <span
                  className="tank-3d__bubble absolute bottom-1 left-[70%] w-1 h-1 rounded-full"
                  style={{ background: "hsl(0 0% 100% / 0.6)", animationDelay: "2.6s" }}
                />
              </div>

              {/* glossy highlight on the glass */}
              <div
                className="absolute top-0 bottom-0 left-[18%] w-2 rounded-full"
                style={{ background: "linear-gradient(180deg, hsl(0 0% 100% / 0.35), transparent)" }}
              />
            </div>

            {/* Top ellipse (rim) */}
            <div
              className="absolute -top-1 left-0 right-0 h-4"
              style={{
                borderRadius: "50%",
                background: "linear-gradient(180deg, hsl(217 33% 34%), hsl(217 33% 18%))",
                border: "1px solid hsl(var(--border))",
                boxShadow: `0 0 10px hsl(${statusVar} / 0.35)`,
              }}
            />

            {/* Centered percentage */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-base font-display font-bold"
                style={{ color: "hsl(0 0% 100%)", textShadow: "0 1px 4px hsl(0 0% 0% / 0.7)" }}
              >
                {Math.round(clamped)}%
              </span>
            </div>
          </div>
        </div>

        {/* Readouts */}
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <p className="text-lg font-display font-bold text-foreground leading-none">
              {formatNumber(Math.round(animatedStock))} <span className="text-sm font-normal text-muted-foreground">L</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Capacité {formatNumber(capacity)} L
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${clamped}%`, background: `hsl(${statusVar})` }}
            />

          </div>
        </div>
      </div>
    </div>
  );
};
