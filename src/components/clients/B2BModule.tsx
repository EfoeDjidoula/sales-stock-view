import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, FilePlus2, ShieldCheck, Receipt, Wallet } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

type Action = "terms" | "exception" | "consumption" | "invoice" | "payment";
type Form = Record<string, string>;
const labels: Record<Action, [string, string]> = {
  terms: ["Nouvelles conditions", "New terms"], exception: ["Autorisation exceptionnelle", "Exceptional approval"],
  consumption: ["Consommation B2B", "B2B purchase"], invoice: ["Facturer la période", "Bill period"], payment: ["Enregistrer un paiement", "Record payment"],
};
const defaults: Form = { contract_reference: "", credit_limit: "", payment_days: "30", policy: "auto_block", reason: "", alert_levels: "70,80,90,100", authorized_total: "", expires_on: "", station_id: "", product_id: "", litres: "", unit_price: "", reference: "", consumed_on: new Date().toISOString().slice(0, 10), period_start: "", period_end: "", invoice_id: "", amount: "", paid_on: new Date().toISOString().slice(0, 10) };

export function B2BModule() {
  const { tenantId, countryId, scopeQuery } = useScope();
  const { can } = usePermissions();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { language } = useLanguage();
  const en = language === "en";
  const t = (fr: string, english: string) => en ? english : fr;
  const money = (n: number) => new Intl.NumberFormat(en ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 }).format(n) + " FCFA";
  const cache = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Action | null>(null);
  const [form, setForm] = useState<Form>(defaults);
  const [sites, setSites] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const permitted = (action: Action) => isPlatformAdmin || can("clients", action === "terms" || action === "exception" ? "edit" : action === "payment" || action === "invoice" ? "validate" : "create");
  const query = useQuery({ queryKey: ["b2b-crm", tenantId, countryId], enabled: !!tenantId && !!countryId, queryFn: async () => {
    const [clients, terms, exceptions, consumptions, invoices, lines, payments, alerts, accounts, cards, vehicles, fuelInvoices, fuelTransactions, stations, products] = await Promise.all([
      scopeQuery(supabase.from("clients").select("*")).order("name").limit(1000),
      scopeQuery(supabase.from("b2b_terms").select("*")).order("created_at", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("b2b_exceptions").select("*")).order("created_at", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("b2b_consumptions").select("*")).order("consumed_on", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("b2b_invoices").select("*")).order("created_at", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("b2b_invoice_lines").select("*")).limit(1000),
      scopeQuery(supabase.from("b2b_payments").select("*")).order("paid_on", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("b2b_credit_alerts").select("*")).order("created_at", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("fuel_card_accounts").select("*")).limit(1000),
      scopeQuery(supabase.from("fuel_cards").select("*")).limit(1000),
      scopeQuery(supabase.from("fuel_card_vehicles").select("*")).limit(1000),
      scopeQuery(supabase.from("fuel_card_invoices").select("*")).limit(1000),
      scopeQuery(supabase.from("fuel_card_transactions").select("*")).order("occurred_at", { ascending: false }).limit(1000),
      scopeQuery(supabase.from("stations").select("id,name")).limit(1000),
      scopeQuery(supabase.from("petroleum_products").select("id,name")).limit(1000),
    ]);
    for (const r of [clients, terms, exceptions, consumptions, invoices, lines, payments, alerts, accounts, cards, vehicles, fuelInvoices, fuelTransactions, stations, products]) if (r.error) throw r.error;
    return { clients: clients.data || [], terms: terms.data || [], exceptions: exceptions.data || [], consumptions: consumptions.data || [], invoices: invoices.data || [], lines: lines.data || [], payments: payments.data || [], alerts: alerts.data || [], accounts: accounts.data || [], cards: cards.data || [], vehicles: vehicles.data || [], fuelInvoices: fuelInvoices.data || [], fuelTransactions: fuelTransactions.data || [], stations: stations.data || [], products: products.data || [] };
  } });
  const data = query.data;
  const selected = data?.clients.find(c => c.id === clientId) || data?.clients.find(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const id = selected?.id;
  const history = useMemo(() => data?.terms.filter(x => x.client_id === id) || [], [data, id]);
  const terms = history[0];
  const accounts = data?.accounts.filter(x => x.client_id === id) || [];
  const accountIds = new Set(accounts.map(a => a.id));
  const cards = data?.cards.filter(x => accountIds.has(x.account_id)) || [];
  const vehicles = data?.vehicles.filter(x => accountIds.has(x.account_id)) || [];
  const consumptions = data?.consumptions.filter(x => x.client_id === id) || [];
  const invoices = data?.invoices.filter(x => x.client_id === id) || [];
  const invoiceIds = new Set(invoices.map(i => i.id));
  const payments = data?.payments.filter(x => invoiceIds.has(x.invoice_id)) || [];
  const fuelInvoices = data?.fuelInvoices.filter(x => accountIds.has(x.account_id)) || [];
  const exposure = accounts.filter(a => a.kind === "postpaid").reduce((s, a) => s + Number(a.credit_used), 0) + consumptions.reduce((s, c) => s + Number(c.amount), 0) - payments.reduce((s, p) => s + Number(p.amount), 0);
  const used = terms && Number(terms.credit_limit) > 0 ? exposure / Number(terms.credit_limit) * 100 : 0;
  const fmtDate = (value: string) => new Date(value).toLocaleDateString(en ? "en-GB" : "fr-FR");
  const open = (action: Action, preset: Partial<Form> = {}) => {
    setForm({ ...defaults, ...preset });
    setSites(action === "terms" ? terms?.site_ids || [] : []);
    setPrices(action === "terms" && terms?.negotiated_prices && typeof terms.negotiated_prices === "object" && !Array.isArray(terms.negotiated_prices) ? Object.fromEntries(Object.entries(terms.negotiated_prices).map(([k, v]) => [k, String(v)])) : {});
    setModal(action);
  };
  const submit = async () => {
    if (!modal || !tenantId || !countryId || !id || !permitted(modal) || busy) return;
    const fields: Record<Action, string[]> = {
      terms: ["contract_reference", "credit_limit", "payment_days", "policy", "reason"], exception: ["authorized_total", "expires_on", "reason"],
      consumption: ["station_id", "product_id", "litres", "unit_price", "reference", "consumed_on"], invoice: ["period_start", "period_end"], payment: ["invoice_id", "amount", "reference", "paid_on"],
    };
    const payload: Record<string, Json> = {};
    fields[modal].forEach(k => { payload[k] = form[k] || ""; });
    if (modal === "terms") { payload.alert_levels = form.alert_levels.split(",").map(Number); payload.site_ids = sites; payload.negotiated_prices = Object.fromEntries(Object.entries(prices).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])); }
    setBusy(true);
    const { error } = await supabase.rpc("b2b_action", { _action: modal, _tenant: tenantId, _country: countryId, _client: id, _data: payload });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("Opération enregistrée", "Saved")); setModal(null);
    await cache.invalidateQueries({ queryKey: ["b2b-crm", tenantId, countryId] });
  };
  if (!countryId) return <p className="text-muted-foreground">{t("Sélectionnez un pays.", "Select a country.")}</p>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{t("Clients B2B · Crédit & facturation", "B2B clients · Credit & billing")}</h2><p className="text-sm text-muted-foreground">{t("Portefeuille professionnel", "Business customers")}</p></div><Input className="max-w-xs" aria-label={t("Rechercher un client", "Search customer")} placeholder={t("Rechercher un client…", "Search customer…")} value={search} onChange={e => { setSearch(e.target.value); setClientId(""); }} /></div>
    {query.isLoading && <p className="text-muted-foreground">{t("Chargement…", "Loading…")}</p>}{query.error && <p role="alert" className="text-destructive">{query.error.message}</p>}
    {!!data?.clients.length && <div className="flex flex-wrap gap-2">{data.clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => <Button key={c.id} size="sm" variant={selected?.id === c.id ? "default" : "outline"} onClick={() => setClientId(c.id)}>{c.name}</Button>)}</div>}
    {data && !data.clients.length && <p className="text-muted-foreground">{t("Aucun client. Créez d’abord sa fiche dans Clients.", "No customers. Create a customer record first.")}</p>}
    {selected && <>
      <div className="border-b border-border pb-5 flex flex-wrap justify-between gap-4"><div><h3 className="text-lg font-semibold">{selected.name}</h3><p className="text-sm text-muted-foreground">{[selected.contact_name, selected.phone, selected.email, selected.address, selected.tax_id].filter(Boolean).join(" · ")}</p><Badge variant={selected.is_active ? "secondary" : "destructive"}>{selected.is_active ? t("Actif", "Active") : t("Inactif", "Inactive")}</Badge></div><div className="flex flex-wrap gap-2">{permitted("terms") && <Button size="sm" onClick={() => open("terms", terms ? { contract_reference: terms.contract_reference, credit_limit: String(terms.credit_limit), payment_days: String(terms.payment_days), policy: terms.policy, alert_levels: terms.alert_levels.join(",") } : {})}><FilePlus2 className="mr-2 size-4" />{labels.terms[en ? 1 : 0]}</Button>}{terms?.policy === "exception" && permitted("exception") && <Button size="sm" variant="outline" onClick={() => open("exception")}><ShieldCheck className="mr-2 size-4" />{labels.exception[en ? 1 : 0]}</Button>}</div></div>
      {terms ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="border-l-2 border-primary pl-4"><p className="text-sm text-muted-foreground">{t("Limite autorisée", "Authorized limit")}</p><strong className="text-xl">{money(Number(terms.credit_limit))}</strong></div><div className="border-l-2 border-warning pl-4"><p className="text-sm text-muted-foreground">{t("Encours", "Outstanding")}</p><strong className="text-xl">{money(exposure)}</strong></div><div className="border-l-2 border-success pl-4"><p className="text-sm text-muted-foreground">{t("Disponible crédit", "Available credit")}</p><strong className="text-xl">{money(Number(terms.credit_limit) - exposure)}</strong></div><div className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">{t("Utilisation", "Utilization")}</p><strong className="text-xl">{Math.round(used)} %</strong><p className="text-xs text-muted-foreground">{terms.alert_levels.join(" / ")} % · {terms.policy === "auto_block" ? t("Blocage automatique", "Automatic block") : t("Dérogation requise", "Approval required")}</p></div></div> : <p className="text-muted-foreground">{t("Aucune condition de crédit configurée.", "No credit terms configured.")}</p>}
      <Tabs defaultValue="activity"><TabsList className="h-auto flex flex-wrap justify-start">{[["activity", "Consommations", "Purchases"], ["invoices", "Factures & paiements", "Invoices & payments"], ["cards", "Cartes & véhicules", "Cards & vehicles"], ["contract", "Contrat & historique", "Contract & history"], ["alerts", "Alertes", "Alerts"]].map(([v, fr, english]) => <TabsTrigger key={v} value={v}>{t(fr, english)}</TabsTrigger>)}</TabsList>
        <TabsContent value="activity" className="space-y-3"><div className="flex justify-end">{terms && permitted("consumption") && <Button size="sm" onClick={() => open("consumption")}><Plus className="mr-2 size-4" />{labels.consumption[en ? 1 : 0]}</Button>}</div>{consumptions.map(c => <div className="border-b border-border py-3 text-sm flex flex-wrap justify-between gap-2" key={c.id}><span>{c.consumed_on} · {data.stations.find(s => s.id === c.station_id)?.name} · {data.products.find(p => p.id === c.product_id)?.name} · {c.reference}</span><span>{c.litres} L · {money(Number(c.amount))} · {data.lines.some(l => l.consumption_id === c.id) ? t("Facturée", "Billed") : t("À facturer", "Unbilled")}</span></div>)}{!consumptions.length && <p className="py-5 text-muted-foreground">{t("Aucune consommation B2B.", "No B2B purchases.")}</p>}</TabsContent>
        <TabsContent value="invoices" className="space-y-3"><div className="flex justify-end">{terms && permitted("invoice") && <Button size="sm" onClick={() => open("invoice")}><Receipt className="mr-2 size-4" />{labels.invoice[en ? 1 : 0]}</Button>}</div>{invoices.map(i => { const paid = payments.filter(p => p.invoice_id === i.id).reduce((s, p) => s + Number(p.amount), 0); return <div key={i.id} className="border-b border-border py-3 flex flex-wrap justify-between gap-3 text-sm"><div><strong>{i.number}</strong> · {i.period_start} → {i.period_end}<p className="text-muted-foreground">{t("Échéance", "Due")} {i.due_on} · {paid >= Number(i.amount) ? t("Payée", "Paid") : i.due_on < new Date().toISOString().slice(0,10) ? t("Impayée / en retard", "Overdue") : t("À régler", "Outstanding")}</p></div><div>{money(Number(i.amount))} · {t("Solde", "Balance")} {money(Number(i.amount) - paid)} {paid < Number(i.amount) && permitted("payment") && <Button size="sm" variant="outline" onClick={() => open("payment", { invoice_id: i.id, amount: String(Number(i.amount) - paid) })}><Wallet className="mr-2 size-4" />{t("Payer", "Pay")}</Button>}</div></div>; })}{fuelInvoices.map(i => <div key={i.id} className="border-b border-border py-3 text-sm">{t("Fuel Card", "Fuel Card")} · {i.number} · {i.period_start} → {i.period_end} · {money(Number(i.amount))} · {t("Solde", "Balance")} {money(Number(i.amount) - Number(i.paid))} · {t("Échéance", "Due")} {i.due_on || "—"} · {Number(i.paid) >= Number(i.amount) ? t("Payée", "Paid") : i.due_on && i.due_on < new Date().toISOString().slice(0, 10) ? t("Impayée / en retard", "Overdue") : t("À régler", "Outstanding")}</div>)}{!invoices.length && !fuelInvoices.length && <p className="py-5 text-muted-foreground">{t("Aucune facture.", "No invoices.")}</p>}<h4 className="font-medium">{t("Paiements enregistrés", "Recorded payments")}</h4>{payments.map(p => <p className="text-sm border-b border-border py-2" key={p.id}>{p.paid_on} · {p.reference} · {money(Number(p.amount))}</p>)}{data.fuelTransactions.filter(x => accountIds.has(x.account_id) && x.kind === "payment").map(p => <p className="text-sm border-b border-border py-2" key={p.id}>{fmtDate(p.occurred_at)} · Fuel Card · {p.reference} · {money(Number(p.amount))}</p>)}</TabsContent>
        <TabsContent value="cards" className="space-y-2">{accounts.map(a => <div key={a.id} className="border-b border-border py-3 text-sm">{a.kind === "postpaid" ? t("Postpayé", "Postpaid") : t("Prépayé", "Prepaid")} · {a.contract_reference} · {a.status} · {t("Plafond", "Limit")} {money(Number(a.credit_limit))} · {t("Utilisé", "Used")} {money(Number(a.credit_used))}</div>)}{cards.map(c => <div key={c.id} className="text-sm border-b border-border py-2">{c.card_number} · {c.holder_name} · {c.status} · {t("Expire", "Expires")} {c.expires_on}</div>)}{vehicles.map(v => <div key={v.id} className="text-sm border-b border-border py-2">{t("Véhicule", "Vehicle")} · {v.plate} · {v.description}</div>)}{!accounts.length && <p className="py-5 text-muted-foreground">{t("Aucun compte Fuel Cards lié.", "No linked Fuel Cards account.")}</p>}</TabsContent>
        <TabsContent value="contract" className="space-y-4">{history.map(h => <div key={h.id} className="border-b border-border py-3 text-sm"><strong>{h.contract_reference}</strong> · {fmtDate(h.effective_at)} · {money(Number(h.credit_limit))} · {h.payment_days} {t("jours", "days")} · {h.reason}<p className="text-muted-foreground">{t("Sites", "Sites")}: {h.site_ids.map(s => data.stations.find(x => x.id === s)?.name || s).join(", ") || t("Tous", "All")}</p><p className="text-muted-foreground">{t("Tarifs négociés", "Negotiated prices")}: {h.negotiated_prices && typeof h.negotiated_prices === "object" && !Array.isArray(h.negotiated_prices) ? Object.entries(h.negotiated_prices).map(([k, v]) => `${data.products.find(p => p.id === k)?.name || k}: ${money(Number(v))}`).join(" · ") || "—" : "—"}</p></div>)}{data.exceptions.filter(e => e.client_id === id).map(e => <p key={e.id} className="text-sm">{t("Dérogation", "Exception")} · {money(Number(e.authorized_total))} · {t("Jusqu’au", "Until")} {e.expires_on} · {e.reason}</p>)}</TabsContent>
        <TabsContent value="alerts">{data.alerts.filter(a => a.client_id === id).map(a => <div className="border-b border-border py-3 text-sm" key={a.id}><Badge variant={a.level >= 100 ? "destructive" : "secondary"}>{a.level} %</Badge> · {fmtDate(a.created_at)} · {t("Encours", "Outstanding")} {money(Number(a.exposure))} / {money(Number(a.credit_limit))}</div>)}{!data.alerts.some(a => a.client_id === id) && <p className="py-5 text-muted-foreground">{t("Aucune alerte de crédit.", "No credit alerts.")}</p>}</TabsContent>
      </Tabs>
    </>}
    <Dialog open={!!modal} onOpenChange={v => { if (!v && !busy) setModal(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{modal && labels[modal][en ? 1 : 0]}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{modal && ({ terms: [["contract_reference", "Contrat / bon de commande", "Contract / purchase order"], ["credit_limit", "Limite de crédit", "Credit limit"], ["payment_days", "Délai de paiement (jours)", "Payment terms (days)"], ["alert_levels", "Seuils d’alerte (%)", "Alert thresholds (%)"], ["policy", "Politique", "Policy"], ["reason", "Motif", "Reason"]], exception: [["authorized_total", "Encours exceptionnel autorisé", "Approved total exposure"], ["expires_on", "Valable jusqu’au", "Valid until"], ["reason", "Motif", "Reason"]], consumption: [["station_id", "Station", "Station"], ["product_id", "Produit", "Product"], ["litres", "Litres", "Litres"], ["unit_price", "Prix unitaire", "Unit price"], ["reference", "Référence unique", "Unique reference"], ["consumed_on", "Date", "Date"]], invoice: [["period_start", "Du", "From"], ["period_end", "Au", "To"]], payment: [["invoice_id", "Facture", "Invoice"], ["amount", "Montant", "Amount"], ["reference", "Référence", "Reference"], ["paid_on", "Date", "Date"]] } as Record<Action, string[][]>)[modal].map(([key, fr, english]) => <div key={key} className="space-y-1"><Label htmlFor={`b2b-${key}`}>{t(fr, english)}</Label>{["policy", "station_id", "product_id", "invoice_id"].includes(key) ? <Select value={form[key] || undefined} onValueChange={v => setForm(f => ({ ...f, [key]: v }))}><SelectTrigger id={`b2b-${key}`}><SelectValue placeholder={t("Choisir", "Select")} /></SelectTrigger><SelectContent>{(key === "policy" ? [["auto_block", t("Blocage automatique", "Automatic block")], ["exception", t("Dérogation contrôlée", "Controlled exception")]] : key === "station_id" ? data?.stations.map(s => [s.id, s.name]) : key === "product_id" ? data?.products.map(p => [p.id, p.name]) : invoices.filter(i => Number(i.amount) > payments.filter(p => p.invoice_id === i.id).reduce((s, p) => s + Number(p.amount), 0)).map(i => [i.id, i.number]) || []).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select> : <Input id={`b2b-${key}`} type={["credit_limit", "payment_days", "authorized_total", "litres", "unit_price", "amount"].includes(key) ? "number" : ["expires_on", "consumed_on", "period_start", "period_end", "paid_on"].includes(key) ? "date" : "text"} min={["credit_limit", "payment_days", "authorized_total", "litres", "unit_price", "amount"].includes(key) ? 0 : undefined} step="any" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />}</div>)}
      {modal === "terms" && <><div className="sm:col-span-2 space-y-2"><Label>{t("Sites autorisés (aucun = tous)", "Allowed sites (none = all)")}</Label><div className="grid grid-cols-2 gap-2">{data?.stations.map(s => <label className="flex gap-2 items-center text-sm" key={s.id}><Checkbox checked={sites.includes(s.id)} onCheckedChange={v => setSites(current => v ? [...current, s.id] : current.filter(id => id !== s.id))} />{s.name}</label>)}</div></div><div className="sm:col-span-2 space-y-2"><Label>{t("Tarifs négociés (laisser vide = tarif standard)", "Negotiated prices (blank = standard rate)")}</Label><div className="grid sm:grid-cols-2 gap-3">{data?.products.map(p => <div key={p.id}><Label htmlFor={`price-${p.id}`}>{p.name}</Label><Input id={`price-${p.id}`} type="number" min={0} step="any" value={prices[p.id] || ""} onChange={e => setPrices(previous => ({ ...previous, [p.id]: e.target.value }))} /></div>)}</div></div></>}
    </div><div className="flex justify-end gap-2 pt-3"><Button variant="outline" disabled={busy} onClick={() => setModal(null)}>{t("Annuler", "Cancel")}</Button><Button disabled={busy} onClick={submit}>{t("Enregistrer", "Save")}</Button></div></DialogContent></Dialog>
  </div>;
}
