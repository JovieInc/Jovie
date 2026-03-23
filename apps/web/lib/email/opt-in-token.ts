/**
 * Opt-In Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for audience marketing opt-in links.
 * Prevents unauthenticated callers from opting arbitrary emails in or out.
 */

import { BASE_URL } from '@/constants/domains';
import {
  buildTokenUrl,
  deriveSecret,
  parseColonPayload,
  signPayload,
  verifyToken,
} from './hmac-token';

const OPT_IN_DOMAIN = 'jovie:audience-opt-in-token-secret';

export function generateOptInToken(
  email: string,
  profileId: string
): string | null {
  const secret = deriveSecret(OPT_IN_DOMAIN);
  const normalizedEmail = email.toLowerCase().trim();
  return signPayload(`${normalizedEmail}:${profileId}`, secret);
}

export function verifyOptInToken(
  token: string
): { email: string; profileId: string } | null {
  const payload = verifyToken(token, deriveSecret(OPT_IN_DOMAIN));
  const parsed = payload ? parseColonPayload(payload) : null;
  if (!parsed || !parsed.first.includes('@')) return null;
  return { email: parsed.first, profileId: parsed.second };
}

export function buildOptInUrl(email: string, profileId: string): string | null {
  return buildTokenUrl(
    BASE_URL,
    '/api/audience/opt-in',
    generateOptInToken(email, profileId)
  );
}
