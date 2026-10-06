import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function CommandB2B({ tenantId, scope, start, end, stationF }: { tenantId: string; scope: string[]; start: string; end: string; stationF: string }) {
  const { t } = useLanguage();
  const today = format(new Date(), "yyyy-MM-dd");
  const q = useQuery({
    queryKey: ["command-b2b", tenantId, scope, start, end],
    enabled: !!tenantId && scope.length > 0,
    queryFn: async () => {
      const sb = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const base = (tb: string, cols: string) => sb.from(tb).select(cols).eq("tenant_id", tenantId).in("country_id", scope);
      const [cl, inv, pay, fInv, fPay, cons, tx, st] = await Promise.all([
        base("clients", "id,name"),
        base("b2b_invoices", "id,client_id,number,amount,due_on,period_end"),
        base("b2b_payments", "invoice_id,amount,paid_on"),
        base("fuel_card_invoices", "id,account_id,amount,due_on,status"),
        base("fuel_card_transactions", "account_id,kind,amount,occurred_at,station_id,litres").in("kind", ["payment"]),
        base("b2b_consumptions", "station_id,litres,amount,consumed_on").gte("consumed_on", start).lte("consumed_on", end),
        base("fuel_card_transactions", "station_id,litres,amount,occurred_at").eq("kind", "purchase").gte("occurred_at", `${start}T00:00:00`).lte("occurred_at", `${end}T23:59:59`),
        base("stations", "id,name"),
      ]);
      const err = [cl, inv, pay, cons, st].find((x) => x.error);
      if (err) throw err.error;
      return { clients: cl.data ?? [], invoices: inv.data ?? [], payments: pay.data ?? [], fuelInvoices: fInv.data ?? [], fuelPayments: fPay.data ?? [], cons: cons.data ?? [], tx: tx.data ?? [], stations: st.data ?? [] };
    },
  });

  if (q.isLoading) return <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (q.error) return <p className="text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const paidBy = (id: string) => d.payments.filter((p: Row) => p.invoice_id === id).reduce((s: number, p: Row) => s + Number(p.amount), 0);
  const invoices = d.invoices.map((i: Row) => ({ ...i, paid: paidBy(i.id), balance: Number(i.amount) - paidBy(i.id) }));
  const open = invoices.filter((i: Row) => i.balance > 0);
  const overdue = open.filter((i: Row) => i.due_on && i.due_on < today);
  const upcoming = open.filter((i: Row) => !i.due_on || i.due_on >= today).sort((a: Row, b: Row) => String(a.due_on).localeCompare(String(b.due_on)));
  const collected = d.payments.filter((p: Row) => p.paid_on >= start && p.paid_on <= end).reduce((s: number, p: Row) => s + Number(p.amount), 0);
  const clientName = (id: string) => d.clients.find((c: Row) => c.id === id)?.name ?? "—";
  const unpaidClients = Object.values(overdue.reduce((acc: Record<string, Row>, i: Row) => {
    const a = acc[i.client_id] ?? { client: clientName(i.client_id), count: 0, balance: 0, oldest: i.due_on };
    a.count++; a.balance += i.balance; if (i.due_on < a.oldest) a.oldest = i.due_on;
    acc[i.client_id] = a; return acc;
  }, {})) as Row[];
  const byStation = d.stations.map((s: Row) => {
    const c = d.cons.filter((x: Row) => x.station_id === s.id); const f = d.tx.filter((x: Row) => x.station_id === s.id);
    return { name: s.name, b2bL: c.reduce((a: number, x: Row) => a + Number(x.litres), 0), b2bF: c.reduce((a: number, x: Row) => a + Number(x.amount), 0),
      fcL: f.reduce((a: number, x: Row) => a + Number(x.litres ?? 0), 0), fcF: f.reduce((a: number, x: Row) => a + Number(x.amount), 0), id: s.id };
  }).filter((s: Row) => (stationF === "all" || s.id === stationF) && (s.b2bL || s.fcL)).sort((a: Row, b: Row) => b.b2bL + b.fcL - a.b2bL - a.fcL);
  const fuelOpen = d.fuelInvoices.filter((i: Row) => i.status !== "paid");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi label={t("Clients en impayé")} value={String(unpaidClients.length)} tone={unpaidClients.length ? "text-destructive" : ""} />
        <Kpi label={t("Montant échu impayé (F)")} value={fmt(overdue.reduce((s: number, i: Row) => s + i.balance, 0))} tone={overdue.length ? "text-destructive" : ""} />
        <Kpi label={t("Factures encaissées sur la période (F)")} value={fmt(collected)} tone="text-success" />
        <Kpi label={t("Encours à échoir (F)")} value={fmt(upcoming.reduce((s: number, i: Row) => s + i.balance, 0))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">{t("Clients en impayé")}</CardTitle></CardHeader><CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>{t("Client")}</TableHead><TableHead className="text-right">{t("Factures")}</TableHead><TableHead className="text-right">{t("Solde (F)")}</TableHead><TableHead>{t("Plus ancienne échéance")}</TableHead></TableRow></TableHeader>
            <TableBody>{unpaidClients.map((u, i) => <TableRow key={i}><TableCell>{u.client}</TableCell><TableCell className="text-right">{u.count}</TableCell><TableCell className="text-right">{fmt(u.balance)}</TableCell><TableCell><Badge variant="outline" className="border-destructive/50 text-destructive">{format(new Date(u.oldest), "dd/MM/yyyy")}</Badge></TableCell></TableRow>)}
              {!unpaidClients.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("Aucun impayé.")}</TableCell></TableRow>}</TableBody></Table>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{t("Échéances à venir")}</CardTitle></CardHeader><CardContent className="p-0">
          <Table><TableHeader><TableRow><TableHead>{t("Facture")}</TableHead><TableHead>{t("Client")}</TableHead><TableHead>{t("Échéance")}</TableHead><TableHead className="text-right">{t("Reste dû (F)")}</TableHead></TableRow></TableHeader>
            <TableBody>{upcoming.slice(0, 10).map((i: Row) => <TableRow key={i.id}><TableCell>{i.number}</TableCell><TableCell>{clientName(i.client_id)}</TableCell><TableCell>{i.due_on ? format(new Date(i.due_on), "dd/MM/yyyy") : "—"}</TableCell><TableCell className="text-right">{fmt(i.balance)}</TableCell></TableRow>)}
              {!upcoming.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("Aucune échéance.")}</TableCell></TableRow>}</TableBody></Table>
          {fuelOpen.length > 0 && <p className="p-3 text-xs text-muted-foreground">{t("Factures Fuel Cards non soldées :")} {fuelOpen.length} · {fmt(fuelOpen.reduce((s: number, i: Row) => s + Number(i.amount), 0))} F</p>}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">{t("Volume B2B par station")}</CardTitle></CardHeader><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t("Station")}</TableHead><TableHead className="text-right">{t("Consommations B2B (L)")}</TableHead><TableHead className="text-right">{t("Consommations B2B (F)")}</TableHead><TableHead className="text-right">{t("Fuel Cards (L)")}</TableHead><TableHead className="text-right">{t("Fuel Cards (F)")}</TableHead><TableHead className="text-right">{t("Total (L)")}</TableHead></TableRow></TableHeader>
          <TableBody>{byStation.map((s: Row) => <TableRow key={s.id}><TableCell>{s.name}</TableCell><TableCell className="text-right">{fmt(s.b2bL)}</TableCell><TableCell className="text-right">{fmt(s.b2bF)}</TableCell><TableCell className="text-right">{fmt(s.fcL)}</TableCell><TableCell className="text-right">{fmt(s.fcF)}</TableCell><TableCell className="text-right font-semibold">{fmt(s.b2bL + s.fcL)}</TableCell></TableRow>)}
            {!byStation.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("Aucun volume B2B sur la période.")}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`font-display text-2xl font-bold ${tone}`}>{value}</div></CardContent></Card>;
}
