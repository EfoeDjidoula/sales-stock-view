import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" },
  });

interface DayRow {
  date: string;
  superLiters: number;
  gasoilLiters: number;
  superStock: number;
  gasoilStock: number;
  note?: string;
}

const SYSTEM = `Tu es un analyste d'exploitation pour un réseau de stations-service.
On te donne, jour par jour, les ventes (litres Super et Gasoil) et les niveaux de stock (jauges en litres) d'une station.
Repère les anomalies : chutes ou pics de ventes inhabituels, stock qui baisse plus (ou moins) que les ventes, stock qui augmente sans livraison plausible, ruptures ou risques de rupture, jours manquants, valeurs incohérentes.
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{"summary": string, "anomalies": [{"date": string, "product": "Super"|"Gasoil"|"Global", "severity": "haute"|"moyenne"|"faible", "title": string, "detail": string}], "actions": [{"priority": 1, "title": string, "detail": string}]}
Au plus 8 anomalies et 5 actions, classées par importance. Rédige en français, concis et concret.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);

  let body: { stationName?: string; start?: string; end?: string; rows?: DayRow[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 120) : [];
  if (rows.length < 2) {
    return json({ error: "Fournissez au moins 2 jours de données." }, 400);
  }
  for (const r of rows) {
    for (const k of ["superLiters", "gasoilLiters", "superStock", "gasoilStock"] as const) {
      if (typeof r[k] !== "number" || !isFinite(r[k]) || r[k] < 0) {
        return json({ error: `Valeur invalide le ${r.date} (${k}).` }, 400);
      }
    }
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Service IA non configuré" }, 500);

  const table = rows
    .map((r) =>
      `${r.date} | ventes Super ${r.superLiters} L, Gasoil ${r.gasoilLiters} L | stock Super ${r.superStock} L, Gasoil ${r.gasoilStock} L${r.note ? ` | note: ${String(r.note).slice(0, 200)}` : ""}`
    )
    .join("\n");
  const prompt = `Station : ${String(body.stationName ?? "").slice(0, 100)}\nPériode : ${body.start} au ${body.end}\n\n${table}`;

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      system: SYSTEM,
      prompt,
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const text = await result.text;
    const runHeaders: Record<string, string> = {};
    const runId = runIdFetch.getRunId();
    if (runId) runHeaders["X-Lovable-AIG-Run-ID"] = runId;

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "Réponse IA illisible, réessayez." }, 502, runHeaders);
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "Réponse IA illisible, réessayez." }, 502, runHeaders);
    }
    return json(
      {
        summary: String(parsed.summary ?? ""),
        anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies.slice(0, 8) : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : [],
      },
      200,
      runHeaders,
    );
  } catch (e: any) {
    const status = e?.statusCode ?? e?.status ?? 500;
    if (status === 402) return json({ error: "Crédits IA épuisés. Ajoutez des crédits dans Paramètres → Plans & crédits." }, 402);
    if (status === 429) return json({ error: "Trop de demandes, réessayez dans un instant." }, 429);
    if (status === 403) return json({ error: "Accès au service IA refusé." }, 403);
    console.error("analyze-station error", e);
    return json({ error: "Erreur du service IA." }, 500);
  }
});
