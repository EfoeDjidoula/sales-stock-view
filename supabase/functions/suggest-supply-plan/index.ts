import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

const SYSTEM = `Tu es planificateur logistique d'un réseau de stations-service.
On te donne les besoins calculés par station et produit (stock, ventes moyennes/jour, couverture en jours, quantité en cours d'acheminement, besoin en litres, urgence) et la flotte disponible (capacité totale et compartiments de chaque camion).
Propose les transports et approvisionnements à planifier en respectant ces règles :
- chaque camion doit être chargé à sa capacité totale ; chaque compartiment reçoit un seul produit et une seule destination ;
- un camion peut desservir plusieurs stations et transporter Super et Gasoil (mixte) ou un seul produit (mono) ;
- ne jamais livrer plus que le besoin d'une station ; si un compartiment ne peut être plein, regroupe ou explique pourquoi ;
- priorise les urgences hautes et les couvertures les plus courtes ; n'utilise que les camions fournis, chacun au plus une fois.
Réponds UNIQUEMENT par un objet JSON valide de la forme :
{"summary": string, "trips": [{"priority": number, "truck": string, "mode": "mono"|"mixte", "planned_date": string, "loads": [{"compartment": number, "litres": number, "product": "Super"|"Gasoil", "station": string}], "reason": string}], "unserved": [{"station": string, "product": string, "litres": number, "reason": string}], "warnings": [string]}
En français, concis et concret.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return json({ error: "Non authentifié" }, 401);

  let body: { today?: string; needs?: any[]; trucks?: any[] };
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const needs = Array.isArray(body.needs) ? body.needs.slice(0, 80) : [];
  const trucks = Array.isArray(body.trucks) ? body.trucks.slice(0, 40) : [];
  if (!needs.length) return json({ error: "Aucun besoin d'approvisionnement à planifier." }, 400);
  if (!trucks.length) return json({ error: "Aucun camion actif avec compartiments." }, 400);
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v) : 0);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Service IA non configuré" }, 500);

  const prompt = `Date : ${String(body.today ?? "").slice(0, 10)}
BESOINS :
${needs.map((n) => `- ${String(n.station).slice(0, 80)} | ${n.product === "gasoil" ? "Gasoil" : "Super"} | stock ${num(n.stock)}/${num(n.capacity)} L | rythme ${n.forecastDaily != null ? `prévu ${num(n.forecastDaily)} L/j (modèle ${String(n.forecastModel ?? "?")}, confiance ${String(n.forecastConfidence ?? "faible")}, ventes constatées ${num(n.avgDaily)} L/j)` : `ventes constatées ${num(n.avgDaily)} L/j`} | rupture estimée ${n.daysToRupture == null ? "inconnue" : Number(n.daysToRupture).toFixed(1) + " j"} | couverture ${n.coverageDays == null ? "inconnue" : Number(n.coverageDays).toFixed(1) + " j"} | en route ${num(n.inTransit)} L | besoin ${num(n.needLitres)} L | urgence ${String(n.urgency).slice(0, 10)}`).join("\n")}
FLOTTE :
${trucks.map((t) => `- ${String(t.registration).slice(0, 30)} | ${num(t.capacity)} L | compartiments ${(Array.isArray(t.compartments) ? t.compartments : []).map((c: unknown, i: number) => `C${i + 1}=${num(c)} L`).join(", ")}`).join("\n")}`;

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runIdFetch.fetch,
  });
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"), system: SYSTEM, prompt, abortSignal: req.signal,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const text = await result.text;
    const rh: Record<string, string> = {};
    const runId = runIdFetch.getRunId(); if (runId) rh["X-Lovable-AIG-Run-ID"] = runId;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Réponse IA illisible, réessayez." }, 502, rh);
    let p: any; try { p = JSON.parse(m[0]); } catch { return json({ error: "Réponse IA illisible, réessayez." }, 502, rh); }
    return json({
      summary: String(p.summary ?? ""), trips: Array.isArray(p.trips) ? p.trips.slice(0, 20) : [],
      unserved: Array.isArray(p.unserved) ? p.unserved.slice(0, 40) : [], warnings: Array.isArray(p.warnings) ? p.warnings.slice(0, 10) : [],
    }, 200, rh);
  } catch (e: any) {
    const status = e?.statusCode ?? e?.status ?? 500;
    if (status === 402) return json({ error: "Crédits IA épuisés. Ajoutez des crédits dans Paramètres → Plans & crédits." }, 402);
    if (status === 429) return json({ error: "Trop de demandes, réessayez dans un instant." }, 429);
    if (status === 403) return json({ error: "Accès au service IA refusé." }, 403);
    console.error("suggest-supply-plan error", e);
    return json({ error: "Erreur du service IA." }, 500);
  }
});
