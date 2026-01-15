/**
 * Contact payload obfuscation utilities.
 *
 * NOTE: This module is client-safe. The actual contact data is now pre-processed
 * server-side in mapper.ts, which builds action URLs directly.
 * These utilities are kept for backwards compatibility with tests and any
 * legacy data that might still use the old encoded format.
 */

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
    .map(char => String.fromCharCode(char.charCodeAt(0) + offset))
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

/**
 * Encode a contact payload using simple obfuscation.
 * @deprecated This is kept for test compatibility only.
 * Production code should use the pre-built actionUrl from mapper.ts.
 */
export function encodeContactPayload(payload: EncodedContactPayload): string {
  const rotated = rotateCharacters(JSON.stringify(payload), 1);
  return base64Encode(rotated);
}

/**
 * Decode a contact payload.
 * @deprecated This is kept for backwards compatibility only.
 * New code should use the pre-built actionUrl from mapper.ts.
 */
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
  } catch {
    return null;
  }
}
