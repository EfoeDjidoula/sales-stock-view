import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { BRAND, BrandFooter, BrandHeader, brandStyles as s } from '../email-templates/brand.tsx'

interface Props {
  reportTitle?: string
  period?: string
  companyName?: string
  headers?: string[]
  rows?: string[][]
  truncated?: number
  note?: string
  link?: string
}

const PeriodicReportEmail = ({ reportTitle = 'Rapport', period = '', companyName = '', headers = [], rows = [], truncated = 0, note, link }: Props) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>{`${reportTitle}${period ? ` — ${period}` : ''}`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <BrandHeader />
        {companyName ? <Text style={brand}>{companyName}</Text> : null}
        <Heading style={s.h1}>{reportTitle}</Heading>
        {period ? <Text style={s.text}>{period}</Text> : null}
        {note ? <Text style={small}>{note}</Text> : null}
        <Section style={{ margin: '16px 0' }}>
          <table style={table} cellPadding={0} cellSpacing={0} role="presentation">
            <thead>
              <tr>{headers.map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...td, textAlign: j === 0 ? 'left' : 'right' }}>{c}</td>)}</tr>
              ))}
              {rows.length === 0 ? <tr><td style={td} colSpan={Math.max(1, headers.length)}>Aucune donnée sur cette période.</td></tr> : null}
            </tbody>
          </table>
          {truncated > 0 ? <Text style={small}>{`+ ${truncated} ligne(s) supplémentaire(s) dans l'application.`}</Text> : null}
        </Section>
        {link ? <Button href={link} style={s.button}>Ouvrir le rapport complet</Button> : null}
        <Hr style={hr} />
        <BrandFooter note="Vous recevez cet e-mail car vous avez demandé l'envoi de ce rapport depuis l'application." />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PeriodicReportEmail,
  subject: (d: Record<string, any>) => `${d.reportTitle ?? 'Rapport'}${d.period ? ` — ${d.period}` : ''}`,
  displayName: 'Rapport périodique',
  previewData: {
    reportTitle: 'Flash ventes quotidien', period: 'Période du 2026-11-18 au 2026-11-18', companyName: 'YATT Energy',
    headers: ['Jour', 'Super (L)', 'Gasoil (L)', 'CA (FCFA)'],
    rows: [['Aujourd\'hui', '12 450', '9 870', '15 761 150'], ['Veille', '11 900', '10 120', '15 560 900']],
    link: 'https://sales-stock-view.lovable.app/?tab=rapports',
  },
} satisfies TemplateEntry

const brand = { color: BRAND.amber, fontWeight: 700, fontSize: '13px', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0 0 4px' }
const small = { fontSize: '12px', color: BRAND.muted }
const table = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }
const th = { padding: '8px 6px', borderBottom: `2px solid ${BRAND.amber}`, color: BRAND.muted, fontWeight: 600, fontSize: '12px' }
const td = { padding: '7px 6px', borderBottom: `1px solid ${BRAND.border}` }
const hr = { borderColor: BRAND.border, margin: '24px 0 12px' }
