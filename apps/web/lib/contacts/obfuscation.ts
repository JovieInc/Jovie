/**
 * Contact payload obfuscation for public profile pages.
 *
 * SECURITY THREAT MODEL:
 * This module uses base64 + character rotation (offset 3), which is intentional
 * anti-scraping obfuscation — NOT cryptographic protection. A determined attacker
 * can reverse it trivially.
 *
 * WHY NOT REAL ENCRYPTION:
 * The decode happens client-side in useArtistContacts.ts to construct mailto:/tel:/sms:
 * URIs synchronously. Moving to server-side decrypt would require an async API call
 * before navigation, which breaks mobile browser user-gesture requirements for
 * protocol handlers.
 *
 * WHAT IT PREVENTS:
 * - Trivial grep-for-emails scraping of API responses
 * - Automated email harvesting by bots that don't execute JS
 * - Casual inspection of network traffic
 *
 * WHAT IT DOES NOT PREVENT:
 * - Determined attackers who reverse-engineer the encoding
 * - Bots that execute the client-side JS
 *
 * FUTURE: A proper server-side encryption design (with proof-of-interaction,
 * captcha, or token-per-session binding) is tracked separately.
 */

import * as Sentry from '@sentry/nextjs';

export interface EncodedContactPayload {
  type: 'email' | 'phone' | 'sms';
  value: string;
  subject?: string;
  contactId?: string;
}

function rotateCharacters(input: string, direction: 1 | -1): string {
  const offset = 3 * direction;
  return input
    .split('')
    .map(char => String.fromCodePoint((char.codePointAt(0) ?? 0) + offset))
    .join('');
}

function base64Encode(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64');
  }
  if (typeof btoa !== 'undefined') {
    return btoa(value);
  }
  throw new SyntaxError('Base64 encoding unavailable in this environment');
}

function base64Decode(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf-8');
  }
  if (typeof atob !== 'undefined') {
    return atob(value);
  }
  throw new SyntaxError('Base64 decoding unavailable in this environment');
}

export function encodeContactPayload(payload: EncodedContactPayload): string {
  const rotated = rotateCharacters(JSON.stringify(payload), 1);
  return base64Encode(rotated);
}

export function decodeContactPayload(
  encoded: string
): EncodedContactPayload | null {
  try {
    const rotated = base64Decode(encoded);
    const json = rotateCharacters(rotated, -1);
    const parsed = JSON.parse(json) as EncodedContactPayload;
    if (!parsed || !['email', 'phone', 'sms'].includes(parsed.type)) {
      return null;
    }
    if (!parsed.value || typeof parsed.value !== 'string') return null;
    return parsed;
  } catch (error) {
    Sentry.addBreadcrumb({
      category: 'contacts',
      message: 'Failed to decode contact payload',
      level: 'warning',
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}
