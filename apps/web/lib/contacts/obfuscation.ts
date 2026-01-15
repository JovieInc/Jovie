import crypto from 'crypto';

import { env, isSecureEnv, isTestEnv } from '@/lib/env-server';

export interface EncodedContactPayload {
  type: 'email' | 'phone';
  value: string;
  subject?: string;
  contactId?: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Cache the derived key to avoid expensive scryptSync calls on every operation
let cachedKey: Buffer | null = null;

/**
 * Get or generate a contact obfuscation key.
 * Uses cached key after first derivation to avoid expensive scryptSync calls.
 *
 * SECURITY: In production/preview, requires CONTACT_OBFUSCATION_KEY to be set.
 * In development/test, falls back to a deterministic key with warning.
 */
function getObfuscationKey(): Buffer {
  // Return cached key if available
  if (cachedKey) {
    return cachedKey;
  }

  const envKey = env.CONTACT_OBFUSCATION_KEY;

  if (envKey) {
    // Derive and cache a 256-bit key from the environment variable
    cachedKey = crypto.scryptSync(envKey, 'jovie-contact-salt', 32);
    return cachedKey;
  }

  // Fail fast in production/preview environments
  if (isSecureEnv()) {
    throw new Error(
      '[Contact Obfuscation] CONTACT_OBFUSCATION_KEY must be set in production/preview. ' +
        'Generate a key with: openssl rand -base64 32'
    );
  }

  // In development/test, use deterministic fallback with warning
  if (!isTestEnv()) {
    console.warn(
      '[Contact Obfuscation] WARNING: CONTACT_OBFUSCATION_KEY not set. ' +
        'Using insecure fallback key. This is only acceptable in development.'
    );
  }

  cachedKey = crypto.scryptSync(
    'jovie-contact-default-key',
    'jovie-contact-salt',
    32
  );
  return cachedKey;
}

export function encodeContactPayload(payload: EncodedContactPayload): string {
  try {
    const key = getObfuscationKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + encrypted into a single base64 string
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64url');
  } catch (error) {
    console.error('Failed to encode contact payload:', error);
    throw new Error('Failed to encode contact payload');
  }
}

export function decodeContactPayload(
  encoded: string
): EncodedContactPayload | null {
  try {
    const key = getObfuscationKey();

    // Try new AES-GCM format first
    const combined = Buffer.from(encoded, 'base64url');

    if (combined.length > IV_LENGTH + AUTH_TAG_LENGTH) {
      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');

      const parsed = JSON.parse(decrypted) as EncodedContactPayload;
      if (!parsed || (parsed.type !== 'email' && parsed.type !== 'phone')) {
        return null;
      }
      if (!parsed.value) return null;
      return parsed;
    }

    // Fallback: try legacy base64 + ROT-3 format for backwards compatibility
    return decodeLegacyPayload(encoded);
  } catch {
    // Try legacy format if AES decryption fails
    return decodeLegacyPayload(encoded);
  }
}

/**
 * Decode legacy ROT-3 encoded payloads for backwards compatibility.
 * @deprecated This format is insecure and only exists for migration.
 */
function decodeLegacyPayload(encoded: string): EncodedContactPayload | null {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    // ROT-3 decode (shift back by 3)
    const json = decoded
      .split('')
      .map(char => String.fromCharCode(char.charCodeAt(0) - 3))
      .join('');
    const parsed = JSON.parse(json) as EncodedContactPayload;
    if (!parsed || (parsed.type !== 'email' && parsed.type !== 'phone')) {
      return null;
    }
    if (!parsed.value) return null;
    console.warn(
      '[Security] Decoded legacy ROT-3 contact payload - should be re-encoded'
    );
    return parsed;
  } catch {
    return null;
  }
}
