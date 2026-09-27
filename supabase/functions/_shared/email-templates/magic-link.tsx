/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

import { BrandFooter, BrandHeader, brandStyles as s } from './brand.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <BrandHeader />
        <Heading style={s.h1}>Your login link</Heading>
        <Text style={s.text}>
          Click the button below to log in to {siteName}. This link will expire
          shortly.
        </Text>
        <Button style={s.button} href={confirmationUrl}>
          Log In
        </Button>
        <BrandFooter note="If you didn't request this link, you can safely ignore this email." />
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
