import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

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
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Support</Text>
        <Heading style={h1}>{kind === 'comment' ? 'Nouvelle réponse du support' : 'Votre ticket a changé de statut'}</Heading>
        <Text style={text}><strong>{ticketNumber}</strong>{subject ? ` — ${subject}` : ''}</Text>
        {kind === 'status' ? (
          <Text style={text}>Nouveau statut : <strong>{statusLabel ?? '—'}</strong></Text>
        ) : (
          <Section style={quote}>
            {author ? <Text style={small}>{author} a écrit :</Text> : null}
            <Text style={text}>{message || '(message vide)'}</Text>
          </Section>
        )}
        {link ? <Button href={link} style={button}>Voir le ticket</Button> : null}
        <Hr style={hr} />
        <Text style={small}>Vous recevez cet email car vous suivez ce ticket de support.</Text>
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

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const brand = { color: '#f59e0b', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase' as const, letterSpacing: '1px' }
const h1 = { fontSize: '20px', color: '#111827', margin: '8px 0 16px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '22px' }
const small = { fontSize: '12px', color: '#6b7280' }
const quote = { borderLeft: '3px solid #f59e0b', paddingLeft: '12px', margin: '12px 0' }
const button = { backgroundColor: '#f59e0b', color: '#111827', padding: '10px 18px', borderRadius: '8px', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0 12px' }
