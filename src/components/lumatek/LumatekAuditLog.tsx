import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, ChevronDown, ChevronRight } from "lucide-react";

const ALL = "__all";
const MODULES = ["authentification", "pays", "utilisateurs", "permissions", "stations", "prix", "stock", "achats", "index", "validations", "modules", "licences", "contrats", "parametres"];
const ACTIONS: Record<string, string> = {
  login: "Connexion", logout: "Déconnexion", country_switch: "Changement de pays",
  create: "Création", update: "Modification", delete: "Suppression",
  activate: "Activation", suspend: "Suspension", enable: "Module activé", disable: "Module désactivé",
  export: "Export",
};
const actionLabel = (a: string) => ACTIONS[a] ?? (a.startsWith("status:") ? `Statut → ${a.slice(7)}` : a);

type Row = {
  id: string; created_at: string; tenant_id: string | null; country_id: string | null; user_id: string | null;
  user_name: string | null; action: string; module: string; entity_type: string | null; entity_id: string | null;
  old_value: unknown; new_value: unknown; ip_address: string | null; user_agent: string | null;
};

export function LumatekAuditLog() {
  const [tenant, setTenant] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [user, setUser] = useState(ALL);
  const [module, setModule] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState<string | null>(null);

  const refs = useQuery({
    queryKey: ["audit-refs"],
    queryFn: async () => {
      const [t, c, p] = await Promise.all([
        supabase.from("tenants").select("id,name").order("name"),
        supabase.from("countries").select("id,name,flag").order("name"),
        supabase.from("profiles").select("user_id,full_name,tenant_id").order("full_name"),
      ]);
      return { tenants: t.data ?? [], countries: c.data ?? [], users: p.data ?? [] };
    },
  });

  const logs = useQuery({
    queryKey: ["audit-logs", tenant, country, user, module, action, from, to],
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*")
        .gte("created_at", `${from}T00:00:00`).lte("created_at", `${to}T23:59:59.999`)
        .order("created_at", { ascending: false }).limit(500);
      if (tenant !== ALL) q = q.eq("tenant_id", tenant);
      if (country !== ALL) q = q.eq("country_id", country);
      if (user !== ALL) q = q.eq("user_id", user);
      if (module !== ALL) q = q.eq("module", module);
      if (action !== ALL) q = action === "status" ? q.like("action", "status:%") : q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return data as Row[];
    },
  });

  const tName = useMemo(() => Object.fromEntries((refs.data?.tenants ?? []).map((t) => [t.id, t.name])), [refs.data]);
  const cName = useMemo(() => Object.fromEntries((refs.data?.countries ?? []).map((c) => [c.id, `${c.flag ?? ""} ${c.name}`])), [refs.data]);
  const users = (refs.data?.users ?? []).filter((u) => tenant === ALL || u.tenant_id === tenant);

  const sel = (v: string, set: (s: string) => void, ph: string, items: [string, string][]) => (
    <Select value={v} onValueChange={set}>
      <SelectTrigger className="w-full"><SelectValue placeholder={ph} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{ph} : tous</SelectItem>
        {items.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6 text-primary" />Journal système</h1>
        <p className="text-sm text-muted-foreground">Traçabilité immuable des actions sensibles. Aucun utilisateur client ne peut modifier ou supprimer une entrée.</p>
      </div>
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {sel(tenant, (v) => { setTenant(v); setUser(ALL); }, "Client", (refs.data?.tenants ?? []).map((t) => [t.id, t.name]))}
          {sel(country, setCountry, "Pays", (refs.data?.countries ?? []).map((c) => [c.id, `${c.flag ?? ""} ${c.name}`]))}
          {sel(user, setUser, "Utilisateur", users.map((u) => [u.user_id, u.full_name ?? u.user_id.slice(0, 8)]))}
          {sel(module, setModule, "Module", MODULES.map((m) => [m, m]))}
          {sel(action, setAction, "Action", [...Object.entries(ACTIONS), ["status", "Changement de statut"]])}
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Du" />
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Au" />
          <Button variant="outline" onClick={() => { setTenant(ALL); setCountry(ALL); setUser(ALL); setModule(ALL); setAction(ALL); }}>Réinitialiser</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{logs.data ? `${logs.data.length} événement(s)${logs.data.length === 500 ? " (500 max, affinez les filtres)" : ""}` : "Événements"}</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {logs.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          {logs.error && <p role="alert" className="text-destructive text-sm">{(logs.error as Error).message}</p>}
          {logs.data?.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement sur cette période.</p>}
          {logs.data?.map((r) => (
            <div key={r.id} className="rounded-md border border-border">
              <button className="flex w-full flex-wrap items-center gap-2 p-2 text-left text-sm hover:bg-muted/40" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="w-36 text-muted-foreground tabular-nums">{new Date(r.created_at).toLocaleString("fr-FR")}</span>
                <Badge variant="outline">{r.module}</Badge>
                <Badge>{actionLabel(r.action)}</Badge>
                <span className="text-muted-foreground">{r.entity_type}</span>
                <span className="ml-auto">{r.user_name ?? (r.user_id ? r.user_id.slice(0, 8) : "Système")}</span>
                <span className="text-muted-foreground">{r.tenant_id ? tName[r.tenant_id] ?? "—" : "Plateforme"}{r.country_id ? ` · ${cName[r.country_id] ?? ""}` : ""}</span>
              </button>
              {open === r.id && (
                <div className="grid gap-2 border-t border-border p-3 text-xs md:grid-cols-2">
                  <div><p className="font-semibold mb-1">Ancienne valeur</p><pre className="max-h-64 overflow-auto rounded bg-muted p-2">{r.old_value ? JSON.stringify(r.old_value, null, 2) : "—"}</pre></div>
                  <div><p className="font-semibold mb-1">Nouvelle valeur</p><pre className="max-h-64 overflow-auto rounded bg-muted p-2">{r.new_value ? JSON.stringify(r.new_value, null, 2) : "—"}</pre></div>
                  <p className="text-muted-foreground md:col-span-2">Élément : {r.entity_id ?? "—"} · IP : {r.ip_address ?? "non disponible"} · Appareil : {r.user_agent ?? "non disponible"}</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
