import { useId } from "react";
import { CheckCircle2, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { compartmentFill, productTone } from "@/lib/tankerVisual";

export type TankerVisualCompartment = {
  id?: string;
  position?: number;
  capacity: number;
  qty: number | string;
  productName?: string;
  destinationName?: string;
  stopOrder?: number | string;
};

type Props = {
  registration: string;
  trailerRegistration?: string;
  driverName?: string;
  compartments: TankerVisualCompartment[];
  capacity?: number;
  departing?: boolean;
  activeIndex?: number;
  onCompartmentClick?: (index: number) => void;
  L: (fr: string, en: string) => string;
};

const fmt = (value: number | string) => Math.round(Number(value) || 0).toLocaleString("fr-FR");
const short = (value: string, max = 20) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const token = (name: string) => `hsl(var(--${name}))`;

/** A read-only SVG tanker whose liquid levels reflect the loading plan. */
export function TankerTruckVisualizer({
  registration,
  trailerRegistration,
  driverName,
  compartments,
  capacity,
  departing = false,
  activeIndex,
  onCompartmentClick,
  L,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const items = compartments.length ? compartments : [{ capacity: Number(capacity) || 0, qty: 0 }];
  const tankX = 42;
  const tankY = 58;
  const tankH = 108;
  const slotW = 176;
  const tankW = Math.max(352, items.length * slotW);
  const actualSlotW = tankW / items.length;
  const cabinX = tankX + tankW + 44;
  const svgW = cabinX + 250;
  const svgH = 348;
  const total = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const totalCapacity = Number(capacity) || items.reduce((sum, item) => sum + (Number(item.capacity) || 0), 0);
  const pct = totalCapacity > 0 ? Math.max(0, Math.min(100, total / totalCapacity * 100)) : 0;
  const full = totalCapacity > 0 && total === totalCapacity && items.every((item) => !!item.productName && !!item.destinationName && Number(item.qty) > 0);
  const products = [...new Set(items.map((item) => item.productName).filter(Boolean))] as string[];

  return (
    <section
      className={cn("relative min-w-0 space-y-3 overflow-hidden rounded-xl border border-border/70 bg-card/60 p-3 sm:p-4", departing && "tanker-truck--departing")}
      aria-label={L("Plan de chargement visuel du camion-citerne", "Visual tanker loading plan")}
      aria-busy={departing}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><Truck className="h-5 w-5" /></div>
          <div>
            <div className="font-display font-semibold">{L("Camion-citerne", "Tanker truck")} · {registration}</div>
            <div className="text-xs text-muted-foreground">
              {trailerRegistration ? `${L("Unité attelée", "Towed unit")} : ${trailerRegistration} · ` : ""}
              {driverName ? `${L("Chauffeur", "Driver")} : ${driverName}` : L("Sélectionnez chaque compartiment pour le repérer dans le formulaire", "Select a compartment to locate it in the form")}
            </div>
          </div>
        </div>
        {full ? (
          <Badge variant="outline" className="border-success text-success"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{L("Chargement complet", "Fully loaded")}</Badge>
        ) : (
          <Badge variant="secondary">{pct.toFixed(1)} %</Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap justify-between gap-2 text-xs">
          <span>{L("Volume planifié", "Planned volume")}</span>
          <span className="font-semibold tabular-nums">{fmt(total)} / {fmt(totalCapacity)} L</span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>

      <div className="max-w-full min-w-0 overflow-x-auto rounded-lg bg-muted/30 px-2 py-1">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-auto w-full" style={{ minWidth: Math.max(680, svgW * 0.78) }} role="img" aria-label={`${registration} — ${fmt(total)} ${L("litres sur", "litres of")} ${fmt(totalCapacity)}`}>
          <defs>
            {items.map((item, index) => {
              const x = tankX + index * actualSlotW + 5;
              return <clipPath key={item.id ?? index} id={`${uid}-comp-${index}`}><rect x={x} y={tankY} width={actualSlotW - 10} height={tankH} rx="13" /></clipPath>;
            })}
          </defs>

          <g className="tanker-truck__vehicle">
            {departing && <path d={`M ${cabinX + 211} 126 L ${cabinX + 252} 103 L ${cabinX + 252} 151 Z`} fill={token("warning")} opacity="0.16" />}
            <rect x={tankX - 8} y={tankY + tankH - 2} width={tankW + 34} height="13" rx="5" fill={token("secondary")} stroke={token("border")} />
            <rect x={tankX + 16} y={tankY - 15} width={tankW - 32} height="18" rx="8" fill={token("secondary")} stroke={token("border")} />
            <rect x={tankX + tankW * 0.46} y={tankY - 24} width="58" height="12" rx="5" fill={token("muted")} stroke={token("border")} />

            {items.map((item, index) => {
              const x = tankX + index * actualSlotW + 5;
              const w = actualSlotW - 10;
              const ratio = item.productName ? compartmentFill(item.qty, item.capacity) : 0;
              const fillH = ratio * tankH;
              const fillY = tankY + tankH - fillH;
              const tone = productTone(item.productName);
              const interactive = !!onCompartmentClick;
              const activate = () => onCompartmentClick?.(index);
              const labelColor = ratio > 0.55 && tone !== "muted" ? token(`${tone}-foreground`) : token("foreground");
              return (
                <g
                  key={item.id ?? index}
                  className={interactive ? "cursor-pointer outline-none" : undefined}
                  onClick={interactive ? activate : undefined}
                >
                  <rect x={x} y={tankY} width={w} height={tankH} rx="13" fill={token("card")} stroke={activeIndex === index ? token("ring") : token("border")} strokeWidth={activeIndex === index ? 4 : 2} />
                  <g clipPath={`url(#${uid}-comp-${index})`}>
                    <rect className="tanker-truck__liquid" x={x} y={fillY} width={w} height={fillH} fill={token(tone)} opacity={tone === "muted" ? 0.35 : 0.9} />
                    {ratio > 0 && ratio < 1 && <path className="tanker-truck__surface" d={`M ${x} ${fillY} Q ${x + w * 0.25} ${fillY - 4} ${x + w * 0.5} ${fillY} T ${x + w} ${fillY}`} fill="none" stroke={token(tone)} strokeWidth="4" />}
                  </g>
                  <text x={x + w / 2} y={tankY + 31} textAnchor="middle" fill={labelColor} fontSize="14" fontWeight="700">{L("COMP.", "COMP.")} {item.position ?? index + 1}</text>
                  <text x={x + w / 2} y={tankY + 57} textAnchor="middle" fill={labelColor} fontSize="18" fontWeight="700">{Math.round(ratio * 100)} %</text>
                  <text x={x + w / 2} y={tankY + 80} textAnchor="middle" fill={labelColor} fontSize="12">{fmt(item.capacity)} L</text>
                  <rect x={x + w / 2 - 8} y={tankY - 9} width="16" height="9" rx="3" fill={token("muted")} stroke={token("border")} />
                  <text x={x + w / 2} y={tankY + tankH + 84} textAnchor="middle" fill={tone === "muted" ? token("muted-foreground") : token(tone)} fontSize="14" fontWeight="700">{short(item.productName ?? L("VIDE", "EMPTY"))}</text>
                  <text x={x + w / 2} y={tankY + tankH + 104} textAnchor="middle" fill={token("foreground")} fontSize="12">{fmt(item.qty)} L</text>
                  <text x={x + w / 2} y={tankY + tankH + 124} textAnchor="middle" fill={token("muted-foreground")} fontSize="12">{short(item.destinationName ?? L("Destination à choisir", "Destination to choose"))}{item.stopOrder ? ` · #${item.stopOrder}` : ""}</text>
                  {interactive && <rect
                    x={x} y={tankY} width={w} height={tankH} rx="13"
                    fill={token("card")} opacity="0"
                    role="button" tabIndex={0}
                    aria-label={`${L("Compartiment", "Compartment")} ${item.position ?? index + 1} — ${item.productName ?? L("vide", "empty")} — ${item.destinationName ?? L("destination à choisir", "destination to choose")}`}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } }}
                  />}
                </g>
              );
            })}

            <path d={`M ${tankX + tankW + 5} 139 L ${cabinX + 17} 139 L ${cabinX + 17} 164 L ${tankX + tankW + 5} 164 Z`} fill={token("secondary")} stroke={token("border")} />
            <path d={`M ${cabinX + 21} 67 L ${cabinX + 146} 67 L ${cabinX + 196} 111 L ${cabinX + 207} 111 L ${cabinX + 207} 181 L ${cabinX + 10} 181 L ${cabinX + 10} 99 Q ${cabinX + 10} 67 ${cabinX + 21} 67 Z`} fill={token("secondary")} stroke={token("foreground")} strokeWidth="2" />
            <path d={`M ${cabinX + 119} 79 L ${cabinX + 145} 79 L ${cabinX + 181} 112 L ${cabinX + 119} 112 Z`} fill={token("muted")} stroke={token("border")} />
            <rect x={cabinX + 25} y="81" width="76" height="31" rx="5" fill={token("muted")} stroke={token("border")} />
            <rect x={cabinX + 22} y="128" width="101" height="34" rx="5" fill={token("card")} stroke={token("border")} />
            <text x={cabinX + 72} y="149" textAnchor="middle" fill={token("foreground")} fontSize="12" fontWeight="700">{short(registration, 15)}</text>
            <rect x={cabinX + 193} y="130" width="15" height="19" rx="4" fill={departing ? token("warning") : token("muted")} className={departing ? "tanker-truck__headlight" : undefined} />
            <rect x={cabinX + 11} y="177" width="197" height="13" rx="4" fill={token("foreground")} />

            {[tankX + tankW * 0.18, tankX + tankW * 0.33, tankX + tankW * 0.79, cabinX + 55, cabinX + 168].map((cx, index) => (
              <g key={cx} className="tanker-truck__wheel">
                <circle cx={cx} cy="193" r="25" fill={token("foreground")} />
                <circle cx={cx} cy="193" r="13" fill={token("muted")} stroke={token("border")} strokeWidth="2" />
                <path d={`M ${cx - 10} 193 H ${cx + 10} M ${cx} 183 V 203`} stroke={token("border")} strokeWidth="2" />
                {index < 3 && <circle cx={cx} cy="193" r="4" fill={token("primary")} />}
              </g>
            ))}
          </g>
          <path d={`M 24 232 H ${svgW - 20}`} stroke={token("border")} strokeWidth="3" strokeDasharray="20 12" />
          <text x="30" y="330" fill={token("muted-foreground")} fontSize="12">{L("Le liquide monte selon le volume affecté à chaque compartiment.", "Liquid rises with the volume assigned to each compartment.")}</text>
        </svg>
      </div>

      {products.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {products.map((product) => <span key={product} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: token(productTone(product)) }} />{product}</span>)}
      </div>}

      {departing && <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-primary/40 bg-card/95 px-5 py-3 text-center shadow-xl" role="status" aria-live="polite">
        <div className="flex items-center justify-center gap-2 font-display font-semibold"><Truck className="h-5 w-5 text-primary" />{L("Départ vers le dépôt…", "Leaving for the depot…")}</div>
        <div className="text-xs text-muted-foreground">{L("Chargement complet, bon enregistré.", "Fully loaded, document saved.")}</div>
      </div>}
    </section>
  );
}
