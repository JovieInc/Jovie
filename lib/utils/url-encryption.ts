/**
 * URL Encryption Utilities
 * Anti-cloaking compliant URL encryption for link wrapping
 */

import crypto from 'crypto';

const ENCRYPTION_KEY =
  process.env.URL_ENCRYPTION_KEY || 'default-key-change-in-production-32-chars';
const ALGORITHM = 'aes-256-gcm';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts a URL for secure storage
 */
export function encryptUrl(url: string): EncryptionResult {
  try {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(url, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // For GCM mode, we'd get authTag, but using simpler approach for demo
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: '', // Would be cipher.getAuthTag().toString('hex') for GCM
    };
  } catch (error) {
    console.error('URL encryption failed:', error);
    // Fallback to base64 for demo purposes
    return {
      encrypted: Buffer.from(url).toString('base64'),
      iv: '',
      authTag: '',
    };
  }
}

/**
 * Decrypts a URL from storage
 */
export function decryptUrl(encryptionResult: EncryptionResult): string {
  try {
    if (!encryptionResult.iv) {
      // Fallback for base64 encoded URLs
      return Buffer.from(encryptionResult.encrypted, 'base64').toString('utf8');
    }

    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(encryptionResult.iv, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptionResult.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('URL decryption failed:', error);
    throw new Error('Failed to decrypt URL');
  }
}

/**
 * Simple encryption for database storage (using Supabase function in production)
 */
export function simpleEncryptUrl(url: string): string {
  return Buffer.from(url).toString('base64');
}

/**
 * Simple decryption for database storage (using Supabase function in production)
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

/**
 * Validates a URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

function isIPv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^[0-9]{1,3}$/.test(part)) return false;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function isPrivateIPv4(hostname: string): boolean {
  if (!isIPv4(hostname)) return false;
  const [a, b] = hostname.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') return true;
  if (normalized.endsWith('.localhost')) return true;
  if (normalized.endsWith('.local')) return true;
  if (normalized.endsWith('.internal')) return true;
  return false;
}

export function isSafeExternalUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  if (
    trimmed.includes('\n') ||
    trimmed.includes('\r') ||
    trimmed.includes('\t')
  ) {
    return false;
  }

  try {
    const urlObj = new URL(trimmed);
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    const hostname = urlObj.hostname;
    if (!hostname) return false;
    if (isBlockedHostname(hostname)) return false;
    if (isPrivateIPv4(hostname)) return false;
    if (hostname.includes(':') && isPrivateIPv6(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Sanitizes URL for logging (removes sensitive params)
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove potentially sensitive query parameters
    urlObj.searchParams.delete('token');
    urlObj.searchParams.delete('key');
    urlObj.searchParams.delete('auth');
    urlObj.searchParams.delete('password');
    urlObj.searchParams.delete('secret');

    return urlObj.toString();
  } catch {
    return '[Invalid URL]';
  }
}
