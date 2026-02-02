/**
 * URL Encryption Utilities
 * Anti-cloaking compliant URL encryption for link wrapping
 */

export {
  extractDomain,
  isValidUrl,
  sanitizeUrlForLogging,
} from './url-parsing';

function base64EncodeUtf8(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }

  // Browser fallback using TextEncoder (modern API)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64DecodeUtf8(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'base64').toString('utf8');
  }

  // Browser fallback using TextDecoder (modern API)
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
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
  throw new Error(
    '[url-encryption] encryptUrl is server-only. Import from @/lib/utils/url-encryption.server'
  );
}

/**
 * Decrypts a URL from storage
 */
export function decryptUrl(encryptionResult: EncryptionResult): string {
  void encryptionResult;
  throw new Error(
    '[url-encryption] decryptUrl is server-only. Import from @/lib/utils/url-encryption.server'
  );
}

/**
 * Simple encryption for database storage
 */
export function simpleEncryptUrl(url: string): string {
  return base64EncodeUtf8(url);
}

/**
 * Simple decryption for database storage
 */
export function simpleDecryptUrl(encrypted: string): string {
  return base64DecodeUtf8(encrypted);
}

/**
 * Generates a cryptographically secure random short ID
 */
export function generateShortId(length: number = 12): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }

  return result;
}

/**
 * Generates a signed token for temporary URL access
 */
export function generateSignedToken(): string {
  throw new Error(
    '[url-encryption] generateSignedToken is server-only. Import from @/lib/utils/url-encryption.server'
  );
}
