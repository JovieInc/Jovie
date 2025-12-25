/**
 * URL Encryption Utilities
 * Anti-cloaking compliant URL encryption for link wrapping
 */

import crypto from 'crypto';
import { env } from '@/lib/env-server';
import {
  extractDomain,
  isValidUrl,
  sanitizeUrlForLogging,
} from './url-parsing';

const DEFAULT_KEY = 'default-key-change-in-production-32-chars';
const ENCRYPTION_KEY = env.URL_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

const isTestTime =
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

// Validate encryption key at module load time
// Skip validation during build (CI=true or NEXT_PHASE=phase-production-build)
const isBuildTime =
  process.env.CI === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';
if (!isBuildTime && (!ENCRYPTION_KEY || ENCRYPTION_KEY === DEFAULT_KEY)) {
  const vercelEnv =
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
  if (vercelEnv === 'production' || vercelEnv === 'preview') {
    throw new Error(
      '[url-encryption] URL_ENCRYPTION_KEY must be set to a secure value in production/preview environments. ' +
        'Generate a key with: openssl rand -base64 32'
    );
  }
  if (vercelEnv === 'development') {
    console.warn(
      '[url-encryption] WARNING: URL_ENCRYPTION_KEY not set or using default value. ' +
        'URL encryption will use a weak default key. Generate a secure key with: openssl rand -base64 32'
    );
  }
}

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
  salt: string;
}

/**
 * Encrypts a URL for secure storage
 */
export function encryptUrl(url: string): EncryptionResult {
  if ((!ENCRYPTION_KEY || ENCRYPTION_KEY === DEFAULT_KEY) && !isTestTime) {
    // In development, fall back to simple base64 encoding
    console.warn(
      '[url-encryption] Using base64 fallback due to missing encryption key'
    );
    return {
      encrypted: Buffer.from(url).toString('base64'),
      iv: '',
      authTag: '',
      salt: '',
    };
  }

  try {
    const keyMaterial = ENCRYPTION_KEY || DEFAULT_KEY;
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(keyMaterial, salt, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encryptedBuffer = Buffer.concat([
      cipher.update(url, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: encryptedBuffer.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      salt: salt.toString('hex'),
    };
  } catch (error) {
    console.error('[url-encryption] Encryption failed:', error);
    throw new Error('Failed to encrypt URL');
  }
}

/**
 * Decrypts a URL from storage
 */
export function decryptUrl(encryptionResult: EncryptionResult): string {
  try {
    // Handle base64 fallback (development mode or legacy data without salt)
    if (
      !encryptionResult.iv ||
      !encryptionResult.authTag ||
      !encryptionResult.salt
    ) {
      return Buffer.from(encryptionResult.encrypted, 'base64').toString('utf8');
    }

    // Require encryption key for AES-GCM decryption
    if ((!ENCRYPTION_KEY || ENCRYPTION_KEY === DEFAULT_KEY) && !isTestTime) {
      throw new Error(
        '[url-encryption] Cannot decrypt AES-GCM encrypted URL without valid encryption key'
      );
    }

    const keyMaterial = ENCRYPTION_KEY || DEFAULT_KEY;

    const salt = Buffer.from(encryptionResult.salt, 'hex');
    const key = crypto.scryptSync(keyMaterial, salt, 32);
    const iv = Buffer.from(encryptionResult.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const authTag = Buffer.from(encryptionResult.authTag, 'hex');
    decipher.setAuthTag(authTag);

    const decryptedBuffer = Buffer.concat([
      decipher.update(Buffer.from(encryptionResult.encrypted, 'hex')),
      decipher.final(),
    ]);

    return decryptedBuffer.toString('utf8');
  } catch (error) {
    console.error('[url-encryption] Decryption failed:', error);
    throw new Error('Failed to decrypt URL');
  }
}

/**
 * Simple encryption for database storage
 */
export function simpleEncryptUrl(url: string): string {
  return Buffer.from(url).toString('base64');
}

/**
 * Simple decryption for database storage
 */
export function simpleDecryptUrl(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf8');
}

/**
 * Generates a secure random short ID
 */
export function generateShortId(length: number = 12): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Generates a signed token for temporary URL access
 */
export function generateSignedToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export { extractDomain, isValidUrl, sanitizeUrlForLogging };
