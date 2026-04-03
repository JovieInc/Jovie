import 'server-only';

import crypto from 'node:crypto';
import { env, isTestEnv } from '@/lib/env-server';
import { captureError, captureWarning } from '@/lib/error-tracking';
import type { EncryptionResult } from './url-encryption';

const ALGORITHM = 'aes-256-gcm';

const SCRYPT_WORK_FACTOR = Object.freeze({
  N: 2 ** 17,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
});

const isTestTime = isTestEnv();

// Build-time detection - these are injected by Next.js build process
// and cannot use env module since it runs at module load
const isBuildTime =
  process.env.CI === 'true' ||
  process.env.NEXT_PHASE === 'phase-production-build';

const ENCRYPTION_KEY = env.URL_ENCRYPTION_KEY;
const runtimeEnvironment = env.VERCEL_ENV || env.NODE_ENV || 'development';
const allowsEphemeralDevKey =
  runtimeEnvironment === 'development' || runtimeEnvironment === 'test';

// Generate a development-only key at runtime (not hardcoded in source)
// This key changes on each server restart, which is acceptable for local dev
// and ephemeral test servers such as Playwright smoke runs in CI.
const DEV_FALLBACK_KEY =
  isTestTime || allowsEphemeralDevKey
    ? crypto.randomBytes(32).toString('base64')
    : undefined;

if (!isBuildTime && !ENCRYPTION_KEY) {
  if (runtimeEnvironment === 'production' || runtimeEnvironment === 'preview') {
    throw new Error(
      '[url-encryption] URL_ENCRYPTION_KEY must be set to a secure value in production/preview environments. ' +
        'Generate a key with: openssl rand -base64 32'
    );
  }

  if (allowsEphemeralDevKey) {
    captureWarning(
      '[url-encryption] WARNING: URL_ENCRYPTION_KEY not set. ' +
        'Using an ephemeral runtime key for this development/test environment. ' +
        'Generate a secure key with: openssl rand -base64 32'
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
    const key = crypto.scryptSync(keyMaterial, salt, 32, SCRYPT_WORK_FACTOR);
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
    throw new SyntaxError('Failed to encrypt URL');
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
    const key = crypto.scryptSync(keyMaterial, salt, 32, SCRYPT_WORK_FACTOR);
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
    throw new SyntaxError('Failed to decrypt URL');
  }
}

// ---------------------------------------------------------------------------
// Raw-key AES-256-GCM helpers for link wrapping (no scrypt key derivation).
//
// The URL_ENCRYPTION_KEY env var is already a cryptographically random 32-byte
// key (base64-encoded). Using it directly avoids the ~50-100ms scrypt cost per
// call, which matters on the hot /go/:shortId redirect path.
// ---------------------------------------------------------------------------

export interface RawKeyEncryptionResult {
  /** Envelope version — always 1 for raw-key AES-GCM */
  v: 1;
  /** AES-GCM ciphertext (hex) */
  encrypted: string;
  /** Random 16-byte IV (hex) */
  iv: string;
  /** GCM auth tag (hex) */
  authTag: string;
}

/**
 * Resolve the raw 32-byte AES key from the env var or test fallback.
 * Throws if no key material is available.
 */
function getRawAesKey(): Buffer {
  const keyMaterial = ENCRYPTION_KEY || DEV_FALLBACK_KEY;
  if (!keyMaterial) {
    throw new Error(
      '[url-encryption] Cannot encrypt/decrypt: URL_ENCRYPTION_KEY not configured.'
    );
  }
  // The key material is base64-encoded. Decode and ensure exactly 32 bytes for AES-256.
  const decoded = Buffer.from(keyMaterial, 'base64');
  if (decoded.length >= 32) {
    return decoded.subarray(0, 32);
  }
  // Key material decoded to fewer than 32 bytes — likely misconfigured
  captureWarning(
    `[url-encryption] URL_ENCRYPTION_KEY decoded to ${decoded.length} bytes (expected ≥32). ` +
      'Falling back to SHA-256 derivation. Generate a proper key with: openssl rand -base64 32'
  );
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

/**
 * Encrypt a URL with AES-256-GCM using the raw key (no scrypt).
 * Returns a versioned envelope for forward-compatible format detection.
 */
export function encryptUrlRawKey(url: string): RawKeyEncryptionResult {
  try {
    const key = getRawAesKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encryptedBuffer = Buffer.concat([
      cipher.update(url, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      v: 1,
      encrypted: encryptedBuffer.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    captureError('[url-encryption] Raw-key encryption failed', error);
    throw new SyntaxError('Failed to encrypt URL');
  }
}

/**
 * Decrypt a URL from a raw-key AES-256-GCM versioned envelope.
 * Expects the output of `encryptUrlRawKey()`.
 */
export function decryptUrlRawKey(data: RawKeyEncryptionResult): string {
  try {
    if (data.v !== 1 || !data.iv || !data.authTag || !data.encrypted) {
      throw new Error(
        '[url-encryption] Invalid raw-key envelope: missing required fields'
      );
    }

    const key = getRawAesKey();
    const iv = Buffer.from(data.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

    const decryptedBuffer = Buffer.concat([
      decipher.update(Buffer.from(data.encrypted, 'hex')),
      decipher.final(),
    ]);

    return decryptedBuffer.toString('utf8');
  } catch (error) {
    captureError('[url-encryption] Raw-key decryption failed', error);
    throw new SyntaxError('Failed to decrypt URL');
  }
}

export function generateSignedToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create an HMAC-signed challenge token for the interstitial page.
 * The token binds to a specific shortId and has a short TTL,
 * preventing bypass via direct API calls.
 */
export function createChallengeToken(shortId: string): {
  token: string;
  issuedAt: number;
} {
  const keyMaterial = ENCRYPTION_KEY || DEV_FALLBACK_KEY;
  if (!keyMaterial) {
    throw new Error(
      '[url-encryption] Cannot create challenge token: encryption key not configured.'
    );
  }
  const issuedAt = Date.now();
  const payload = `${shortId}:${issuedAt}`;
  const hmac = crypto
    .createHmac('sha256', keyMaterial)
    .update(payload)
    .digest('hex');
  return { token: `${hmac}.${issuedAt}`, issuedAt };
}

/**
 * Verify an HMAC-signed challenge token.
 * Returns true only if the token was signed by this server,
 * matches the given shortId, and has not expired.
 */
export function verifyChallengeToken(shortId: string, token: string): boolean {
  const keyMaterial = ENCRYPTION_KEY || DEV_FALLBACK_KEY;
  if (!keyMaterial) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const receivedHmac = token.substring(0, dotIndex);
  const issuedAtStr = token.substring(dotIndex + 1);
  const issuedAt = Number(issuedAtStr);

  if (!Number.isFinite(issuedAt)) return false;

  const age = Date.now() - issuedAt;
  if (age < 0 || age > CHALLENGE_TTL_MS) return false;

  const expectedPayload = `${shortId}:${issuedAtStr}`;
  const expectedHmac = crypto
    .createHmac('sha256', keyMaterial)
    .update(expectedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(receivedHmac, 'hex'),
    Buffer.from(expectedHmac, 'hex')
  );
}
