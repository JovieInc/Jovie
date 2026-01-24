import 'server-only';

import crypto from 'crypto';
import { env } from '@/lib/env-server';
import { captureError, captureWarning } from '@/lib/error-tracking';
import type { EncryptionResult } from './url-encryption';

const ALGORITHM = 'aes-256-gcm';

const isTestTime =
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const isBuildTime =
  process.env.CI === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

const ENCRYPTION_KEY = env.URL_ENCRYPTION_KEY;

// Generate a development-only key at runtime (not hardcoded in source)
// This key changes on each server restart, which is acceptable for development
const DEV_FALLBACK_KEY = isTestTime
  ? crypto.randomBytes(32).toString('base64')
  : undefined;

if (!isBuildTime && !ENCRYPTION_KEY) {
  const vercelEnv =
    process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';

  if (vercelEnv === 'production' || vercelEnv === 'preview') {
    throw new Error(
      '[url-encryption] URL_ENCRYPTION_KEY must be set to a secure value in production/preview environments. ' +
        'Generate a key with: openssl rand -base64 32'
    );
  }

  if (vercelEnv === 'development') {
    captureWarning(
      '[url-encryption] WARNING: URL_ENCRYPTION_KEY not set. ' +
        'URL encryption will fail in this environment. Generate a secure key with: openssl rand -base64 32'
    );
  }
}

export function encryptUrl(url: string): EncryptionResult {
  const keyMaterial = ENCRYPTION_KEY || DEV_FALLBACK_KEY;

  if (!keyMaterial) {
    throw new Error(
      '[url-encryption] Cannot encrypt URL: encryption key not configured. ' +
        'Set URL_ENCRYPTION_KEY environment variable.'
    );
  }

  try {
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
    captureError('[url-encryption] Encryption failed', error);
    throw new Error('Failed to encrypt URL');
  }
}

export function decryptUrl(encryptionResult: EncryptionResult): string {
  try {
    if (
      !encryptionResult.iv ||
      !encryptionResult.authTag ||
      !encryptionResult.salt
    ) {
      // Log warning for legacy unencrypted data and throw error
      captureWarning(
        '[url-encryption] Attempted to decrypt legacy unencrypted URL data. ' +
          'This data should be re-encrypted with proper encryption.'
      );
      throw new Error(
        '[url-encryption] Cannot decrypt: missing encryption metadata (iv, authTag, or salt). ' +
          'This may be legacy unencrypted data that needs migration.'
      );
    }

    const keyMaterial = ENCRYPTION_KEY || DEV_FALLBACK_KEY;

    if (!keyMaterial) {
      throw new Error(
        '[url-encryption] Cannot decrypt AES-GCM encrypted URL without valid encryption key'
      );
    }

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
    captureError('[url-encryption] Decryption failed', error);
    throw new Error('Failed to decrypt URL');
  }
}

export function generateSignedToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
