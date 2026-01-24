import * as Sentry from '@sentry/nextjs';

export interface EncodedContactPayload {
  type: 'email' | 'phone';
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
  throw new Error('Base64 encoding unavailable in this environment');
}

function base64Decode(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf-8');
  }
  if (typeof atob !== 'undefined') {
    return atob(value);
  }
  throw new Error('Base64 decoding unavailable in this environment');
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
    if (!parsed || (parsed.type !== 'email' && parsed.type !== 'phone')) {
      return null;
    }
    if (!parsed.value) return null;
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
