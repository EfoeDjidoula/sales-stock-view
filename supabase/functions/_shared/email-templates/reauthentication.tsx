/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { BRAND, BrandFooter, BrandHeader, brandStyles as s } from './brand.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <BrandHeader />
        <Heading style={s.h1}>Confirm reauthentication</Heading>
        <Text style={s.text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <BrandFooter note="This code will expire shortly. If you didn't request this, you can safely ignore this email." />
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: BRAND.orange,
  letterSpacing: '4px',
  margin: '0 0 30px',
}
