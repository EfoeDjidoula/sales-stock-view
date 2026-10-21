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

const SYSTEM = `Tu es l'Assistant IA LUMATEK d'un réseau de stations-service.
Tu ne disposes QUE des faits et lignes calculés fournis (déjà limités aux données autorisées de l'utilisateur). N'invente aucun chiffre, station ou client. Si une information manque, dis-le.
Tu ne peux rien modifier : toute action se fait par l'utilisateur via les écrans et workflows de validation de l'application.
Réponds UNIQUEMENT par un objet JSON valide :
{"answer": string, "facts": [string], "calculations": [string], "recommendations": [string], "sources": [string]}
- facts : constats repris des données fournies ;
- calculations : ratios/comparaisons dérivés des données fournies, avec la formule ;
- recommendations : actions proposées (à valider par un humain) ;
- sources : libellés des KPI/sources utilisés.
Rédige dans la langue de la question, concis et concret.`;

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return json({ error: "Non authentifié" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide" }, 400); }
  const question = clip(body?.question, 500).trim();
  const ctx = body?.context ?? {};
  if (!question) return json({ error: "Question vide" }, 400);
  const facts = (Array.isArray(ctx.facts) ? ctx.facts : []).slice(0, 30);
  const rows = (Array.isArray(ctx.rows) ? ctx.rows : []).slice(0, 30);
  const countryId = typeof body?.countryId === "string" && /^[0-9a-f-]{36}$/i.test(body.countryId) ? body.countryId : null;

  // Journalisation de la requête (le serveur rattache tenant/utilisateur et ignore un pays non autorisé)
  await supabase.rpc("log_audit_event", {
    _action: "view_sensitive", _module: "assistant_ia", _entity_type: clip(ctx.intent, 50), _entity_id: null,
    _country_id: countryId, _details: { question, period: clip(ctx.period, 60), facts: facts.length, rows: rows.length }, _device: null,
  });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Service IA non configuré" }, 500);
  const prompt = `QUESTION : ${question}
ANALYSE : ${clip(ctx.title, 100)} | période ${clip(ctx.period, 60)}
FAITS CALCULÉS :
${facts.map((f: any) => `- ${clip(f?.label, 80)} = ${clip(f?.value, 60)} [source : ${clip(f?.source, 80)}]`).join("\n") || "- aucun"}
DÉTAIL :
${rows.map((r: unknown) => `- ${clip(r, 200)}`).join("\n") || "- aucune ligne"}`;

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: runIdFetch.fetch,
  });
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"), system: SYSTEM, prompt, abortSignal: req.signal,
      providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    });
    const text = await result.text;
    const rh: Record<string, string> = {};
    const runId = runIdFetch.getRunId(); if (runId) rh["X-Lovable-AIG-Run-ID"] = runId;
    const m = text.match(/\{[\s\S]*\}/);
    let p: any = null; try { p = m ? JSON.parse(m[0]) : null; } catch { /* */ }
    if (!p) return json({ error: "Réponse IA illisible, réessayez." }, 502, rh);
    const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map((x) => clip(x, 500)) : []);
    return json({ answer: clip(p.answer, 3000), facts: arr(p.facts), calculations: arr(p.calculations), recommendations: arr(p.recommendations), sources: arr(p.sources) }, 200, rh);
  } catch (e: any) {
    const status = e?.statusCode ?? e?.status ?? 500;
    if (status === 402) return json({ error: "Crédits IA épuisés. Ajoutez des crédits dans Paramètres → Plans & crédits." }, 402);
    if (status === 429) return json({ error: "Trop de demandes, réessayez dans un instant." }, 429);
    if (status === 403) return json({ error: "Accès au service IA refusé." }, 403);
    console.error("lumatek-assistant error", e);
    return json({ error: "Erreur du service IA." }, 500);
  }
});
