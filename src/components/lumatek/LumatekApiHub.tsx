import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, KeyRound, RefreshCw, Send, Ban, RotateCw, Plus } from "lucide-react";

export const API_SCOPES = ["stations:read", "products:read", "stocks:read", "sales:read", "orders:read", "deliveries:read", "fuelcards:read", "b2b:read", "reports:read"];
export const WEBHOOK_EVENTS = ["closure.validated", "closure.reopened", "supply.received", "fraud.alert", "webhook.test"];
const BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-v1`;
const db = supabase as any;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

function useHub() {
  return useQuery({
    queryKey: ["api-hub"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [t, tc, k, l, w, d] = await Promise.all([
        db.from("tenants").select("id,name").order("name"),
        db.from("tenant_countries").select("tenant_id,country_id,is_active,countries(name)").eq("is_active", true),
        db.from("api_keys").select("*").order("created_at", { ascending: false }),
        db.from("api_request_logs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
        db.from("webhook_endpoints").select("id,tenant_id,name,url,events,allowed_countries,status,created_at").order("created_at", { ascending: false }),
        db.from("webhook_deliveries").select("id,endpoint_id,event,status,attempts,response_code,last_error,created_at,delivered_at").order("created_at", { ascending: false }).limit(300),
      ]);
      for (const r of [t, tc, k, l, w, d]) if (r.error) throw r.error;
      return { tenants: t.data, tcs: tc.data, keys: k.data, logs: l.data, hooks: w.data, deliveries: d.data };
    },
  });
}

function SecretDialog({ value, title, onClose }: { value: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Copiez cette valeur maintenant : elle ne sera plus jamais affichée.</p>
        <div className="flex gap-2"><Input readOnly value={value ?? ""} className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(value ?? ""); toast.success("Copié"); }}><Copy className="h-4 w-4" /></Button></div>
        <DialogFooter><Button onClick={onClose}>J'ai copié</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LumatekApiHub() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useHub();
  const [secret, setSecret] = useState<{ v: string; t: string } | null>(null);
  const [tenant, setTenant] = useState("");
  const [name, setName] = useState("");
  const [integration, setIntegration] = useState("");
  const [rate, setRate] = useState(60);
  const [scopes, setScopes] = useState<string[]>(["stations:read"]);
  const [countries, setCountries] = useState<string[]>([]);
  const [hookUrl, setHookUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["closure.validated"]);
  const [logFilter, setLogFilter] = useState("all");

  const tenantName = (id: string) => data?.tenants.find((t: any) => t.id === id)?.name ?? id.slice(0, 8);
  const tenantCountries = (data?.tcs ?? []).filter((c: any) => c.tenant_id === tenant);
  const refresh = () => qc.invalidateQueries({ queryKey: ["api-hub"] });
  const toggle = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const stats = useMemo(() => {
    const logs = data?.logs ?? [];
    const day = Date.now() - 86400000;
    const l24 = logs.filter((l: any) => new Date(l.created_at).getTime() > day);
    const errs = logs.filter((l: any) => l.status_code >= 400);
    const avg = logs.length ? Math.round(logs.reduce((s: number, l: any) => s + (l.duration_ms ?? 0), 0) / logs.length) : 0;
    const perKey: Record<string, { calls: number; errors: number }> = {};
    for (const l of logs) { const p = (perKey[l.api_key_id ?? "none"] ??= { calls: 0, errors: 0 }); p.calls++; if (l.status_code >= 400) p.errors++; }
    return { total: logs.length, l24: l24.length, errs: errs.length, rate: logs.length ? ((errs.length / logs.length) * 100).toFixed(1) : "0", avg, perKey };
  }, [data]);

  const call = async (fn: string, args: any) => {
    const { data: r, error } = await db.rpc(fn, args);
    if (error) { toast.error(error.message); return null; }
    refresh(); return r;
  };

  const createKey = async () => {
    const r = await call("api_key_create", { _tenant: tenant, _name: name, _integration: integration, _scopes: scopes, _countries: countries, _rate: rate, _expires: null });
    if (r) { setSecret({ v: r.key, t: "Nouvelle clé API" }); setName(""); setIntegration(""); }
  };
  const createHook = async () => {
    const r = await call("webhook_create", { _tenant: tenant, _name: name || "Webhook", _url: hookUrl, _events: events, _countries: countries });
    if (r) { setSecret({ v: r.secret, t: "Secret de signature du webhook" }); setHookUrl(""); }
  };
  const dispatch = async () => {
    const { data: r, error } = await supabase.functions.invoke("api-webhooks");
    if (error) toast.error(error.message); else toast.success(`${r.processed} envoi(s) : ${r.delivered} livrés, ${r.failed} en échec`);
    refresh();
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  const logs = (data?.logs ?? []).filter((l: any) => logFilter === "all" || (logFilter === "errors" ? l.status_code >= 400 : l.api_key_id === logFilter)).slice(0, 300);

  const scopeForm = (
    <div className="grid gap-3 md:grid-cols-2">
      <Select value={tenant} onValueChange={(v) => { setTenant(v); setCountries([]); }}>
        <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
        <SelectContent>{data?.tenants.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input placeholder="Nom (ex. ERP Sage)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="md:col-span-2 flex flex-wrap gap-3 text-sm">
        <span className="text-muted-foreground">Pays autorisés :</span>
        {tenant && !tenantCountries.length && <span className="text-destructive">Aucun pays actif</span>}
        {tenantCountries.map((c: any) => (
          <label key={c.country_id} className="flex items-center gap-1"><Checkbox checked={countries.includes(c.country_id)} onCheckedChange={() => toggle(countries, c.country_id, setCountries)} />{c.countries?.name}</label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Clés actives", data?.keys.filter((k: any) => k.status === "active").length], ["Appels 24 h", stats.l24], ["Appels 30 j", stats.total], ["Taux d'erreur", `${stats.rate} %`], ["Latence moy.", `${stats.avg} ms`]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{isFetching ? <Skeleton className="h-7 w-16" /> : v}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button></div>

      <Tabs defaultValue="keys">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="keys">Clés API</TabsTrigger>
          <TabsTrigger value="logs">Journal d'appels</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="docs">Documentation v1</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />Créer une clé</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {scopeForm}
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Intégration (optionnel)" value={integration} onChange={(e) => setIntegration(e.target.value)} />
                <Input type="number" min={1} max={10000} value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Appels par minute" />
              </div>
              <div className="flex flex-wrap gap-3 text-sm">{API_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1 font-mono text-xs"><Checkbox checked={scopes.includes(s)} onCheckedChange={() => toggle(scopes, s, setScopes)} />{s}</label>))}</div>
              <Button disabled={!tenant || !name || !countries.length || !scopes.length} onClick={createKey}><Plus className="mr-2 h-4 w-4" />Générer la clé</Button>
            </CardContent></Card>
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Nom</TableHead><TableHead>Préfixe</TableHead><TableHead>Scopes</TableHead><TableHead>Limite</TableHead><TableHead>Appels/erreurs 30 j</TableHead><TableHead>Dernier appel</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{data?.keys.map((k: any) => {
              const expired = k.expires_at && new Date(k.expires_at) < new Date();
              const p = stats.perKey[k.id];
              return (
                <TableRow key={k.id}>
                  <TableCell>{tenantName(k.tenant_id)}</TableCell>
                  <TableCell>{k.name}<div className="text-xs text-muted-foreground">{k.integration}</div></TableCell>
                  <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                  <TableCell className="max-w-56"><div className="flex flex-wrap gap-1">{k.scopes.map((s: string) => <Badge key={s} variant="secondary" className="font-mono text-[10px]">{s}</Badge>)}</div></TableCell>
                  <TableCell>{k.rate_limit_per_minute}/min</TableCell>
                  <TableCell>{p?.calls ?? 0} / <span className={p?.errors ? "text-destructive" : ""}>{p?.errors ?? 0}</span></TableCell>
                  <TableCell className="text-xs">{fmt(k.last_used_at)}</TableCell>
                  <TableCell><Badge variant={k.status === "active" && !expired ? "default" : "destructive"}>{k.status === "revoked" ? "Révoquée" : expired ? "Expirée" : k.expires_at ? `Expire ${fmt(k.expires_at)}` : "Active"}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{k.status === "active" && !expired && <>
                    <Button size="icon" variant="ghost" title="Rotation (ancienne clé valable 24 h)" onClick={async () => { const r = await call("api_key_rotate", { _id: k.id, _grace_hours: 24 }); if (r) setSecret({ v: r.key, t: "Clé après rotation" }); }}><RotateCw className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" title="Révoquer" onClick={() => { const reason = prompt("Motif de révocation"); if (reason) call("api_key_revoke", { _id: k.id, _reason: reason }); }}><Ban className="h-4 w-4 text-destructive" /></Button></>}
                  </TableCell>
                </TableRow>);
            })}{!data?.keys.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Aucune clé</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Derniers appels (30 jours)</CardTitle>
            <Select value={logFilter} onValueChange={setLogFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="errors">Erreurs uniquement</SelectItem>
                {data?.keys.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.name} ({k.prefix})</SelectItem>)}</SelectContent></Select></CardHeader>
            <CardContent className="p-0 overflow-x-auto"><Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Requête</TableHead><TableHead>Code</TableHead><TableHead>Durée</TableHead><TableHead>Lignes</TableHead><TableHead>Erreur</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
              <TableBody>{logs.map((l: any) => (
                <TableRow key={l.id}><TableCell className="text-xs">{fmt(l.created_at)}</TableCell><TableCell>{l.tenant_id ? tenantName(l.tenant_id) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.method} {l.endpoint}</TableCell>
                  <TableCell><Badge variant={l.status_code >= 400 ? "destructive" : "secondary"}>{l.status_code}</Badge></TableCell>
                  <TableCell>{l.duration_ms} ms</TableCell><TableCell>{l.rows_returned ?? "—"}</TableCell><TableCell className="text-xs text-destructive">{l.error}</TableCell><TableCell className="text-xs">{l.ip}</TableCell></TableRow>))}
                {!logs.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Aucun appel</TableCell></TableRow>}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Nouveau webhook signé</CardTitle></CardHeader><CardContent className="space-y-3">
            {scopeForm}
            <Input placeholder="https://erp.client.com/hooks/lumatek" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
            <div className="flex flex-wrap gap-3">{WEBHOOK_EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-1 font-mono text-xs"><Checkbox checked={events.includes(e)} onCheckedChange={() => toggle(events, e, setEvents)} />{e}</label>))}</div>
            <div className="flex gap-2"><Button disabled={!tenant || !hookUrl.startsWith("https://") || !countries.length || !events.length} onClick={createHook}><Plus className="mr-2 h-4 w-4" />Créer</Button>
              <Button variant="outline" onClick={dispatch}><Send className="mr-2 h-4 w-4" />Envoyer les événements en attente</Button></div>
          </CardContent></Card>
          <Card><CardContent className="p-0 overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Nom / URL</TableHead><TableHead>Événements</TableHead><TableHead>Livrés / échecs / attente</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{data?.hooks.map((h: any) => {
              const ds = data.deliveries.filter((d: any) => d.endpoint_id === h.id);
              const c = (s: string) => ds.filter((d: any) => d.status === s).length;
              const lastErr = ds.find((d: any) => d.last_error)?.last_error;
              return (<TableRow key={h.id}><TableCell>{tenantName(h.tenant_id)}</TableCell>
                <TableCell>{h.name}<div className="font-mono text-xs text-muted-foreground">{h.url}</div>{lastErr && <div className="text-xs text-destructive">{lastErr}</div>}</TableCell>
                <TableCell className="font-mono text-[10px]">{h.events.join(", ")}</TableCell>
                <TableCell>{c("delivered")} / <span className="text-destructive">{c("failed")}</span> / {c("pending")}</TableCell>
                <TableCell><Badge variant={h.status === "active" ? "default" : "secondary"}>{h.status === "active" ? "Actif" : "Désactivé"}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => call("webhook_test", { _id: h.id })}>Test</Button>
                  <Button size="sm" variant="ghost" onClick={() => call("webhook_set_status", { _id: h.id, _status: h.status === "active" ? "disabled" : "active" })}>{h.status === "active" ? "Désactiver" : "Activer"}</Button>
                </TableCell></TableRow>);
            })}{!data?.hooks.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Aucun webhook</TableCell></TableRow>}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card><CardContent className="prose prose-invert max-w-none p-6 text-sm space-y-3">
            <p><b>URL de base :</b> <code>{BASE}/v1</code> — lecture seule, JSON, pagination <code>limit</code> (≤ 500) et <code>offset</code>.</p>
            <p><b>Authentification :</b> <code>Authorization: Bearer lmtk_live_…</code>. Chaque appel vérifie : clé active et non expirée, licence du client, pays actifs et autorisés pour la clé, scope, module activé pour le pays. Limite par minute (en-têtes <code>X-RateLimit-*</code>, code 429).</p>
            <Table><TableHeader><TableRow><TableHead>Endpoint</TableHead><TableHead>Scope</TableHead><TableHead>Module</TableHead><TableHead>Filtres</TableHead></TableRow></TableHeader><TableBody>
              {[["/v1/me", "—", "—", ""], ["/v1/stations", "stations:read", "stations", "country_id"], ["/v1/products", "products:read", "stations", "country_id"], ["/v1/stocks", "stocks:read", "stocks", "country_id, station_id"], ["/v1/sales", "sales:read", "ventes", "from, to, station_id"], ["/v1/orders", "orders:read", "commandes", "from, to, station_id"], ["/v1/deliveries", "deliveries:read", "livraisons", "from, to"], ["/v1/fuel-cards", "fuelcards:read", "cartes_carburant", "country_id"], ["/v1/fuel-card-transactions", "fuelcards:read", "cartes_carburant", "from, to, station_id"], ["/v1/b2b-clients", "b2b:read", "clients_b2b", "country_id"], ["/v1/b2b-invoices", "b2b:read", "clients_b2b", "from, to"], ["/v1/reports/summary", "reports:read", "reporting", "from, to"]].map(([e, s, m, f]) => (
                <TableRow key={e}><TableCell className="font-mono text-xs">GET {e}</TableCell><TableCell className="font-mono text-xs">{s}</TableCell><TableCell>{m}</TableCell><TableCell className="text-xs">{f}</TableCell></TableRow>))}
            </TableBody></Table>
            <pre className="rounded bg-muted p-3 text-xs overflow-x-auto">{`curl -H "Authorization: Bearer lmtk_live_…" "${BASE}/v1/sales?from=2026-10-01&to=2026-10-24"`}</pre>
            <p><b>Webhooks :</b> POST JSON avec en-têtes <code>X-Lumatek-Event</code>, <code>X-Lumatek-Delivery</code> et <code>X-Lumatek-Signature: t=…,v1=…</code> (HMAC-SHA256 du texte <code>t + "." + corps</code> avec le secret). Rejetez les signatures de plus de 5 minutes. 6 tentatives avec délai croissant.</p>
            <pre className="rounded bg-muted p-3 text-xs overflow-x-auto">{`const [t, v1] = header.split(",").map(p => p.split("=")[1]);
const expected = crypto.createHmac("sha256", SECRET).update(t + "." + rawBody).digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected)) && Date.now()/1000 - +t < 300;`}</pre>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      <SecretDialog value={secret?.v ?? null} title={secret?.t ?? ""} onClose={() => setSecret(null)} />
    </div>
  );
}
