/**
 * Opt-In Token Utilities
 *
 * Generates and verifies HMAC-signed tokens for audience marketing opt-in links.
 * Prevents unauthenticated callers from opting arbitrary emails in or out.
 */

import { BASE_URL } from '@/constants/domains';
import { buildTokenUrl, createColonTokenFns } from './hmac-token';

const { sign, verify } = createColonTokenFns({
  domain: 'jovie:audience-opt-in-token-secret',
  emailIndex: 0,
});

export function generateOptInToken(
  email: string,
  profileId: string
): string | null {
  return sign(email, profileId);
}

export function verifyOptInToken(
  token: string
): { email: string; profileId: string } | null {
  const result = verify(token);
  return result ? { email: result.first, profileId: result.second } : null;
}

export function buildOptInUrl(email: string, profileId: string): string | null {
  return buildTokenUrl(
    BASE_URL,
    '/api/audience/opt-in',
    generateOptInToken(email, profileId)
  );
}
