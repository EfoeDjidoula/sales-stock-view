// Sends the report currently displayed to the signed-in user's own address only.
// Requires reports.view; content is plain text cells (escaped by React), size-capped.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { withCors } from '../_shared/cors.ts'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const cors = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...cors } })
const cell = (v: unknown, max = 60) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max)
const REPORT_KEYS = new Set(['flash', 'monthly', 'stock', 'losses', 'control', 'aged', 'logistics'])
const MAX_ROWS = 40

Deno.serve(withCors(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Authentification requise' }, 401)

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  })
  const { data: who } = await sb.auth.getUser(auth.slice(7))
  const user = who?.user
  if (!user?.email) return json({ error: 'Session invalide' }, 401)
  // Only a confirmed address with no pending change may receive reports.
  if (!user.email_confirmed_at || (user as { new_email?: string }).new_email) return json({ error: 'Adresse e-mail non confirmée' }, 403)
  const { data: perms, error: permErr } = await sb.rpc('get_user_permissions', { _user_id: user.id })
  if (permErr || !(perms as { code: string }[] | null)?.some((p) => p.code === 'reports.view')) return json({ error: 'Permission reports.view requise' }, 403)

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }
  const key = String(b.report_key ?? '')
  if (!REPORT_KEYS.has(key)) return json({ error: 'Rapport inconnu' }, 400)
  const from = String(b.from ?? ''), to = String(b.to ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return json({ error: 'Période invalide' }, 400)
  const headers = Array.isArray(b.headers) ? (b.headers as unknown[]).slice(0, 8).map((h) => cell(h, 40)) : []
  const allRows = Array.isArray(b.rows) ? (b.rows as unknown[]).filter(Array.isArray) as unknown[][] : []
  const rows = allRows.slice(0, MAX_ROWS).map((r) => r.slice(0, 8).map((c) => cell(c)))
  // Fixed destination: never derived from request headers.
  const link = 'https://sales-stock-view.lovable.app/?tab=rapports'

  try {
    const res = await sendTemplateEmail('periodic-report', user.email, {
      templateData: {
        reportTitle: cell(b.title, 120), period: `Période du ${from} au ${to}`, companyName: cell(b.company, 80),
        headers, rows, truncated: Math.max(0, allRows.length - MAX_ROWS), note: b.note ? cell(b.note, 300) : undefined, link,
      },
      idempotencyKey: `report-${user.id}-${key}-${from}-${to}-${Math.floor(Date.now() / 60000)}`,
    })
    if (!res.sent) return json({ sent: false, reason: 'Votre adresse a refusé nos e-mails (désinscription ou rejet).' })
    return json({ sent: true, to: user.email })
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string }
    if (err.code === 'domain_not_verified') return json({ error: "L'adresse d'expédition des e-mails n'est pas encore vérifiée." }, 503)
    if (err.code === 'emails_disabled') return json({ error: "L'envoi d'e-mails est désactivé." }, 503)
    if (err.status === 429) return json({ error: 'Trop d\'envois, réessayez dans une minute.' }, 429)
    console.error('send-report-email', err.message)
    return json({ error: "Envoi impossible pour le moment." }, 500)
  }
}))
