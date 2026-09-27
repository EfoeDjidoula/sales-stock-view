import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, BrandFooter, BrandHeader, brandStyles as s } from '../email-templates/brand.tsx'

interface Props {
  ticketNumber?: string
  subject?: string
  kind?: 'status' | 'comment'
  statusLabel?: string
  author?: string
  message?: string
  link?: string
}

const TicketUpdateEmail = ({ ticketNumber = '', subject = '', kind = 'status', statusLabel, author, message, link }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{kind === 'comment' ? `Nouvelle réponse sur votre ticket ${ticketNumber}` : `Votre ticket ${ticketNumber} est ${statusLabel ?? 'mis à jour'}`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <BrandHeader />
        <Text style={brand}>Support {BRAND.name}</Text>
        <Heading style={s.h1}>{kind === 'comment' ? 'Nouvelle réponse du support' : 'Votre ticket a changé de statut'}</Heading>
        <Text style={s.text}><strong>{ticketNumber}</strong>{subject ? ` — ${subject}` : ''}</Text>
        {kind === 'status' ? (
          <Text style={s.text}>Nouveau statut : <strong style={{ color: BRAND.orange }}>{statusLabel ?? '—'}</strong></Text>
        ) : (
          <Section style={quote}>
            {author ? <Text style={small}>{author} a écrit :</Text> : null}
            <Text style={s.text}>{message || '(message vide)'}</Text>
          </Section>
        )}
        {link ? <Button href={link} style={s.button}>Voir le ticket</Button> : null}
        <Hr style={hr} />
        <BrandFooter note="Vous recevez cet email car vous suivez ce ticket de support." />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TicketUpdateEmail,
  subject: (d: Record<string, any>) =>
    d.kind === 'comment' ? `Réponse sur votre ticket ${d.ticketNumber ?? ''}` : `Ticket ${d.ticketNumber ?? ''} : ${d.statusLabel ?? 'mis à jour'}`,
  displayName: 'Mise à jour de ticket',
  previewData: { ticketNumber: 'TK-2026-F6370A', subject: 'Écart de jauge cuve Super', kind: 'comment', author: 'Patrick AKOLLY', message: 'Bonjour, nous analysons l\'écart.', link: 'https://sales-stock-view.lovable.app/?tab=support&ticket=x' },
} satisfies TemplateEntry

const brand = { color: BRAND.amber, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 4px' }
const small = { fontSize: '12px', color: BRAND.muted }
const quote = { borderLeft: `3px solid ${BRAND.amber}`, paddingLeft: '12px', margin: '12px 0' }
const hr = { borderColor: BRAND.border, margin: '24px 0 12px' }
