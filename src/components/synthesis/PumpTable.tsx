import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PumpRecap } from "@/lib/ecap";

const fmt = (v: number, d = 0) => (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Index et sorties par pistolet configuré, avec cumul, PU et montant par carburant. */
export function PumpTable({ recap, withAmounts = true }: { recap: PumpRecap; withAmounts?: boolean }) {
  if (!recap.lines.length) return <p className="text-sm text-muted-foreground">Aucun index retenu sur la période.</p>;
  return (
    <Table className="min-w-[820px]">
      <TableHeader>
        <TableRow>
          <TableHead>Pompe</TableHead><TableHead className="text-right">Index arrivée</TableHead><TableHead className="text-right">Index départ</TableHead>
          <TableHead className="text-right">Sortie</TableHead><TableHead className="text-right">Ret. cuve</TableHead><TableHead className="text-right">Sortie réelle</TableHead>
          {withAmounts && <><TableHead className="text-right">PU</TableHead><TableHead className="text-right">Montant</TableHead></>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(["super", "gasoil"] as const).flatMap((f) => {
          const ls = recap.lines.filter((l) => l.fuel === f);
          if (!ls.length) return [];
          const r = recap.fuels[f];
          return [
            ...ls.map((l) => (
              <TableRow key={l.pumpId}>
                <TableCell className="font-medium">{l.name}</TableCell>
                {[l.indexArrivee, l.indexDepart, l.sortie, l.retour].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{fmt(v, 2)}</TableCell>)}
                <TableCell className="text-right tabular-nums font-semibold">{fmt(l.net, 2)}</TableCell>
                {withAmounts && <><TableCell /><TableCell className="text-right tabular-nums">{fmt(l.montant)}</TableCell></>}
              </TableRow>
            )),
            <TableRow key={`cumul-${f}`} className="bg-muted/30 font-semibold">
              <TableCell colSpan={5}>Cumul {f === "super" ? "Super" : "Gasoil"}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(r.cumul, 2)}</TableCell>
              {withAmounts && <><TableCell className="text-right tabular-nums" title={r.puVariable ? "Prix moyen : le prix a changé sur la période" : undefined}>{fmt(r.pu)}{r.puVariable ? " (moy.)" : ""}</TableCell><TableCell className="text-right tabular-nums">{fmt(r.montant)}</TableCell></>}
            </TableRow>,
          ];
        })}
        {withAmounts && <TableRow className="bg-primary/10 font-semibold"><TableCell colSpan={7}>Total</TableCell><TableCell className="text-right tabular-nums">{fmt(recap.totalMontant)}</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}
