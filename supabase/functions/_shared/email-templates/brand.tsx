/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Img, Section, Text } from 'npm:@react-email/components@0.0.22'

export const BRAND = {
  name: 'LUMATEK',
  logoUrl: 'https://sales-stock-view.lovable.app/email/lumatek-logo.png',
  amber: '#f59e0b',
  orange: '#ea580c',
  ink: '#1c1917',
  muted: '#78716c',
  border: '#e7e5e4',
}

export const BrandHeader = () => (
  <Section style={headerWrap}>
    <Img src={BRAND.logoUrl} alt={BRAND.name} width="180" height="90" style={logoImg} />
  </Section>
)

export const BrandFooter = ({ note }: { note?: string }) => (
  <Section style={footerWrap}>
    {note ? <Text style={footerNote}>{note}</Text> : null}
    <Text style={footerBrand}>
      Propulsé par <span style={{ color: BRAND.amber, fontWeight: 700 }}>LUMATEK</span> TECHNOLOGY
    </Text>
  </Section>
)

export const brandStyles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' },
  container: {
    padding: '24px 28px',
    maxWidth: '560px',
    border: `1px solid ${BRAND.border}`,
    borderRadius: '12px',
    margin: '24px auto',
  },
  h1: { fontSize: '22px', fontWeight: 'bold' as const, color: BRAND.ink, margin: '0 0 20px' },
  text: { fontSize: '14px', color: '#44403c', lineHeight: '1.5', margin: '0 0 25px' },
  link: { color: BRAND.orange, textDecoration: 'underline' },
  button: {
    backgroundColor: BRAND.amber,
    color: BRAND.ink,
    fontSize: '14px',
    fontWeight: 700,
    border: `1px solid ${BRAND.orange}`,
    borderRadius: '8px',
    padding: '12px 20px',
    textDecoration: 'none',
  },
  footer: { fontSize: '12px', color: BRAND.muted, margin: '30px 0 0' },
}

const headerWrap = { textAlign: 'center' as const, padding: '8px 0 16px', borderBottom: `2px solid ${BRAND.amber}`, marginBottom: '20px' }
const logoImg = { margin: '0 auto', display: 'block' }
const footerWrap = { borderTop: `1px solid ${BRAND.border}`, marginTop: '28px', paddingTop: '14px' }
const footerNote = { fontSize: '12px', color: BRAND.muted, margin: '0 0 6px' }
const footerBrand = { fontSize: '11px', color: BRAND.muted, textAlign: 'center' as const, margin: 0 }
