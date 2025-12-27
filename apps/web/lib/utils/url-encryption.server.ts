import 'server-only';

import crypto from 'crypto';
import { env } from '@/lib/env-server';
import { createScopedLogger } from '@/lib/utils/logger';
import type { EncryptionResult } from './url-encryption';

const log = createScopedLogger('UrlEncryption');

const DEFAULT_KEY = 'default-key-change-in-production-32-chars';
const ALGORITHM = 'aes-256-gcm';

const isTestTime =
  process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const isBuildTime =
  process.env.CI === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

const ENCRYPTION_KEY = env.URL_ENCRYPTION_KEY;

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
    log.warn(
      'WARNING: URL_ENCRYPTION_KEY not set or using default value. URL encryption will use a weak default key. Generate a secure key with: openssl rand -base64 32'
    );
  }
}

export function encryptUrl(url: string): EncryptionResult {
  if ((!ENCRYPTION_KEY || ENCRYPTION_KEY === DEFAULT_KEY) && !isTestTime) {
    log.warn('Using base64 fallback due to missing encryption key');

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
    log.error('Encryption failed', { error });
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
      return Buffer.from(encryptionResult.encrypted, 'base64').toString('utf8');
    }

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
    log.error('Decryption failed', { error });
    throw new Error('Failed to decrypt URL');
  }
}

export function generateSignedToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
