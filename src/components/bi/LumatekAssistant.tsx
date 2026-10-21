import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { buildContext, detectIntent, type AssistantContext } from "@/lib/assistant/context";
import type { Dataset } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";

type Answer = { answer: string; facts: string[]; calculations: string[]; recommendations: string[]; sources: string[] };
const EXAMPLES = [
  "Pourquoi les ventes ont-elles baissé sur la période ?",
  "Quelles stations ont les plus gros écarts ?",
  "Quels clients ont dépassé 80 % de leur plafond ?",
  "Quelles stations risquent une rupture dans les prochains jours ?",
  "Génère le rapport mensuel du pays sélectionné.",
];

export function LumatekAssistant({ d, tenantId, countryIds, countryName, start, end }: { d: Dataset & { clients: any[] }; tenantId: string; countryIds: string[]; countryName?: string; start: string; end: string }) {
  const { t } = useLanguage();
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<{ q: string; ctx: AssistantContext; a?: Answer; error?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const terms = useQuery({
    queryKey: ["assistant-terms", tenantId, countryIds],
    queryFn: async () => ((await (supabase as any).from("b2b_terms").select("client_id,credit_limit,effective_at").eq("tenant_id", tenantId).in("country_id", countryIds)).data ?? []) as any[],
  });

  const ask = async (question: string) => {
    if (!question.trim() || loading) return;
    const today = new Date().toISOString().slice(0, 10);
    const ctx = buildContext(detectIntent(question), d, { start, end, today, terms: terms.data ?? [], countryName });
    setHistory((h) => [...h, { q: question, ctx }]); setQ(""); setLoading(true);
    const { data, error } = await supabase.functions.invoke("lumatek-assistant", { body: { question, context: ctx, countryId: countryIds.length === 1 ? countryIds[0] : null } });
    let msg = (data as any)?.error as string | undefined;
    if (error && !msg) { try { msg = (await (error as any)?.context?.json())?.error; } catch { /* */ } msg ??= t("Erreur du service IA."); }
    setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, a: msg ? undefined : (data as Answer), error: msg } : x)));
    setLoading(false);
  };

  const Section = ({ title, items, variant }: { title: string; items: string[]; variant: "secondary" | "outline" | "default" }) =>
    items.length ? <div className="space-y-1"><Badge variant={variant}>{t(title)}</Badge><ul className="list-disc pl-5 text-sm space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="size-5 text-primary" />{t("Assistant IA LUMATEK")}</CardTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="size-3" />{t("Les chiffres sont calculés par l'application sur vos seules données autorisées ; l'IA rédige, ne modifie rien. Chaque question est journalisée.")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">{EXAMPLES.map((e) => <Button key={e} size="sm" variant="outline" disabled={loading} onClick={() => ask(t(e))}>{t(e)}</Button>)}</div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <Input value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder={t("Posez votre question…")} />
            <Button type="submit" disabled={loading || !q.trim()}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
          </form>
        </CardContent>
      </Card>

      {[...history].reverse().map((h, i) => (
        <Card key={history.length - i} className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">{h.q}</CardTitle><p className="text-xs text-muted-foreground">{t(h.ctx.title)} · {h.ctx.period}</p></CardHeader>
          <CardContent className="space-y-3">
            {!h.a && !h.error && <Loader2 className="size-4 animate-spin" />}
            {h.error && <p className="text-sm text-destructive">{h.error}</p>}
            {h.a && <>
              <p className="text-sm whitespace-pre-line">{h.a.answer}</p>
              <Section title="Faits" items={h.a.facts} variant="secondary" />
              <Section title="Calculs" items={h.a.calculations} variant="outline" />
              <Section title="Recommandations (à valider)" items={h.a.recommendations} variant="default" />
            </>}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("Données et KPI utilisés")} ({h.ctx.facts.length + h.ctx.rows.length})</summary>
              <ul className="mt-2 space-y-0.5">{h.ctx.facts.map((f, j) => <li key={j}>{f.label} : <strong>{f.value}</strong> — {f.source}</li>)}</ul>
              {h.ctx.rows.length > 0 && <ul className="mt-2 list-disc pl-5">{h.ctx.rows.map((r, j) => <li key={j}>{r}</li>)}</ul>}
            </details>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
