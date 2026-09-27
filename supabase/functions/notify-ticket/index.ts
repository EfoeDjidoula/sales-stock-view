import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const STATUS: Record<string, string> = {
  new: 'Nouveau', assigned: 'Assigné', in_progress: 'En cours',
  waiting_client: 'En attente client', resolved: 'Résolu', closed: 'Fermé',
}
const FALLBACK_ORIGIN = 'https://sales-stock-view.lovable.app'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Non authentifié' }, 401)

    const body = await req.json().catch(() => ({}))
    const ticketId = typeof body.ticket_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.ticket_id) ? body.ticket_id : null
    if (!ticketId) return json({ error: 'ticket_id invalide' }, 400)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: ticket } = await admin.from('support_tickets').select('id, ticket_number, subject, tenant_id, created_by').eq('id', ticketId).maybeSingle()
    if (!ticket) return json({ error: 'Ticket introuvable' }, 404)
    const { data: allowed } = await admin.rpc('can_access_tenant', { _user_id: user.id, _tenant_id: ticket.tenant_id })
    if (!allowed) return json({ error: 'Accès refusé' }, 403)

    const { data: pending } = await admin.from('support_notifications').select('id, event, payload')
      .eq('ticket_id', ticketId).eq('audience', 'client').eq('status', 'pending').order('created_at').limit(20)
    if (!pending?.length) return json({ sent: 0 })

    const { data: creator } = await admin.auth.admin.getUserById(ticket.created_by)
    const email = creator?.user?.email
    const origin = req.headers.get('origin') ?? ''
    const base = /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : FALLBACK_ORIGIN
    const link = `${base}/?tab=support&ticket=${ticket.id}`

    let sent = 0
    for (const n of pending) {
      const p = (n.payload ?? {}) as Record<string, any>
      if (!email) {
        await admin.from('support_notifications').update({ status: 'skipped' }).eq('id', n.id)
        continue
      }
      const isComment = n.event !== 'status_changed'
      try {
        const r = await sendTemplateEmail('ticket-update', email, {
          templateData: {
            ticketNumber: ticket.ticket_number, subject: ticket.subject,
            kind: isComment ? 'comment' : 'status',
            statusLabel: STATUS[p.to] ?? p.to, author: p.author, message: p.message, link,
          },
          idempotencyKey: `ticket-update-${n.id}`,
        })
        await admin.from('support_notifications').update({ status: r.sent ? 'sent' : 'skipped', sent_at: r.sent ? new Date().toISOString() : null }).eq('id', n.id)
        if (r.sent) sent++
      } catch (e) {
        console.error('send failed', n.id, (e as Error).message)
        await admin.from('support_notifications').update({ status: 'failed' }).eq('id', n.id)
      }
    }
    return json({ sent })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
