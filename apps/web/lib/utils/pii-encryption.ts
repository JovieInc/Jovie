/**
 * PII Encryption Utilities
 * Field-level AES-256-GCM encryption for Personally Identifiable Information
 *
 * Encrypts: email, phone, IP address
 * Compliance: GDPR, CCPA
 */

import crypto from 'crypto';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { env, isTestEnv } from '@/lib/env-server';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get the PII encryption key from environment (read at runtime, not cached)
 */
function getPIIEncryptionKey(): string | undefined {
  return env.PII_ENCRYPTION_KEY;
}

/**
 * Derive a consistent encryption key from the environment variable
 */
function getEncryptionKey(): Buffer {
  const key = getPIIEncryptionKey();
  if (!key) {
    throw new Error(
      'PII_ENCRYPTION_KEY environment variable is required for PII encryption'
    );
  }

  // Use scrypt to derive a 256-bit key from the provided key
  return crypto.scryptSync(key, 'jovie-pii-salt', KEY_LENGTH);
}

export interface EncryptedPII {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Check if PII encryption is enabled (key is configured)
 */
export function isPIIEncryptionEnabled(): boolean {
  return Boolean(getPIIEncryptionKey());
}

/**
 * Check if running in a test environment
 */
function isTestEnvironment(): boolean {
  return isTestEnv();
}

/**
 * Encrypts a PII value using AES-256-GCM
 * Returns null if the value is null/undefined
 *
 * SECURITY: In production/preview, throws if encryption key is not configured.
 * In development/test, returns value unencrypted with a warning.
 */
export function encryptPII(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (!isPIIEncryptionEnabled()) {
    const vercelEnvValue = env.VERCEL_ENV || env.NODE_ENV || 'development';

    // Fail-fast in production and preview environments
    if (vercelEnvValue === 'production' || vercelEnvValue === 'preview') {
      throw new Error(
        '[PII Encryption] PII_ENCRYPTION_KEY must be set in production/preview environments. ' +
          'Generate a key with: openssl rand -base64 32'
      );
    }

    // In development/test without key, return value as-is with warning
    if (env.NODE_ENV === 'development' || isTestEnvironment()) {
      captureWarning(
        '[PII Encryption] WARNING: PII_ENCRYPTION_KEY not set - storing value unencrypted. ' +
          'This is only acceptable in development.'
      );
      return value;
    }

    throw new Error('PII encryption key not configured');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Combine iv:authTag:ciphertext for storage
    const combined = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    return combined;
  } catch (error) {
    captureError('[PII Encryption] Failed to encrypt', error);
    throw new Error('Failed to encrypt PII data');
  }
}

/**
 * Decrypts a PII value encrypted with encryptPII
 * Returns null if the value is null/undefined
 *
 * SECURITY: Logs warnings for legacy unencrypted data to aid migration tracking.
 */
export function decryptPII(
  encryptedValue: string | null | undefined
): string | null {
  if (
    encryptedValue === null ||
    encryptedValue === undefined ||
    encryptedValue === ''
  ) {
    return null;
  }

  if (!isPIIEncryptionEnabled()) {
    const vercelEnvValue = env.VERCEL_ENV || env.NODE_ENV || 'development';

    // Fail-fast in production and preview environments
    if (vercelEnvValue === 'production' || vercelEnvValue === 'preview') {
      throw new Error(
        '[PII Encryption] PII_ENCRYPTION_KEY must be set in production/preview environments'
      );
    }

    // In development without key, return value as-is
    if (env.NODE_ENV === 'development' || isTestEnvironment()) {
      return encryptedValue;
    }
    throw new Error('PII encryption key not configured');
  }

  // Check if value is encrypted (contains our separator pattern)
  if (!encryptedValue.includes(':')) {
    // Value is not encrypted (legacy data) - log warning for migration tracking
    captureWarning(
      '[PII Encryption] Detected legacy unencrypted PII data. ' +
        'This data should be migrated to encrypted format.',
      { dataLength: encryptedValue.length }
    );
    return encryptedValue;
  }

  try {
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
      // Not our encryption format - log warning for migration tracking
      captureWarning(
        '[PII Encryption] Detected data with unexpected format (not iv:authTag:ciphertext). ' +
          'This may be legacy data that needs migration.'
      );
      return encryptedValue;
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Log detailed error for debugging and security monitoring
    captureError('[PII Encryption] Decryption failed', error, {
      dataLength: encryptedValue.length,
      hasExpectedFormat: encryptedValue.split(':').length === 3,
    });
    // Return null on decryption failure to prevent exposing corrupt data
    return null;
  }
}

/**
 * Encrypts an email address
 */
export function encryptEmail(email: string | null | undefined): string | null {
  return encryptPII(email);
}

/**
 * Decrypts an email address
 */
export function decryptEmail(
  encryptedEmail: string | null | undefined
): string | null {
  return decryptPII(encryptedEmail);
}

/**
 * Encrypts a phone number
 */
export function encryptPhone(phone: string | null | undefined): string | null {
  return encryptPII(phone);
}

/**
 * Decrypts a phone number
 */
export function decryptPhone(
  encryptedPhone: string | null | undefined
): string | null {
  return decryptPII(encryptedPhone);
}

/**
 * Encrypts an IP address
 */
export function encryptIP(ip: string | null | undefined): string | null {
  return encryptPII(ip);
}

/**
 * Decrypts an IP address
 */
export function decryptIP(
  encryptedIP: string | null | undefined
): string | null {
  return decryptPII(encryptedIP);
}

/**
 * Masks an IP address for fingerprinting (IPv4: x.x.x.0, IPv6: first 4 segments)
 * This provides privacy while still allowing visitor identification
 */
export function maskIPForFingerprint(ip: string | null | undefined): string {
  if (!ip) return 'unknown';

  // IPv6
  if (ip.includes(':')) {
    const segments = ip.split(':');
    return segments.slice(0, 4).join(':') + '::';
  }

  // IPv4
  const octets = ip.split('.');
  if (octets.length >= 3) {
    return `${octets.slice(0, 3).join('.')}.0`;
  }

  return 'unknown';
}

/**
 * Creates a deterministic hash of PII for lookup purposes
 * This allows finding records without storing plaintext
 */
export function hashPIIForLookup(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const normalizedValue = value.toLowerCase().trim();
  return crypto
    .createHash('sha256')
    .update(`jovie:${normalizedValue}`)
    .digest('hex');
}

/**
 * Batch encrypt multiple PII fields
 */
export function encryptPIIFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[]
): T {
  const result = { ...data };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' || value === null || value === undefined) {
      (result as Record<string, unknown>)[field as string] = encryptPII(
        value as string | null | undefined
      );
    }
  }
  return result;
}

/**
 * Batch decrypt multiple PII fields
 */
export function decryptPIIFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[]
): T {
  const result = { ...data };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' || value === null || value === undefined) {
      (result as Record<string, unknown>)[field as string] = decryptPII(
        value as string | null | undefined
      );
    }
  }
  return result;
}
