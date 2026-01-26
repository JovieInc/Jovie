/**
 * Tracking Token Utilities
 *
 * HMAC-SHA256 signed request tokens for audience tracking endpoints.
 * Prevents unauthorized metric spam and ensures requests originate from
 * legitimate Jovie profile pages.
 *
 * Token format: {profileId}:{timestamp}:{signature}
 * Validity: 5 minutes (configurable)
 */

import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { env } from '@/lib/env-server';

// Token validity in milliseconds (5 minutes default)
const TOKEN_VALIDITY_MS = 5 * 60 * 1000;

// Maximum allowed clock skew in milliseconds (30 seconds)
const MAX_CLOCK_SKEW_MS = 30 * 1000;

/**
 * Get the tracking token secret (read at runtime, not cached at import)
 */
function getTrackingSecret(): string | undefined {
  return env.TRACKING_TOKEN_SECRET;
}

export interface TrackingTokenPayload {
  profileId: string;
  timestamp: number;
}

export interface TrackingTokenValidation {
  valid: boolean;
  payload?: TrackingTokenPayload;
  error?: string;
}

/**
 * Parse and validate a dev token (format: {profileId}:{timestamp}:dev)
 */
/**
 * Parse and validate a dev token (format: {profileId}:{timestamp}:dev)
 */
function parseDevToken(
  token: string,
  expectedProfileId?: string
): TrackingTokenValidation {
  const parts = token.split(':');
  if (parts.length !== 3 || parts[2] !== 'dev') {
    return { valid: false, error: 'Token validation not configured' };
  }

  const profileId = parts[0];
  if (expectedProfileId && profileId !== expectedProfileId) {
    return { valid: false, error: 'Profile ID mismatch' };
  }

  return {
    valid: true,
    payload: {
      profileId,
      timestamp: Number.parseInt(parts[1], 10),
    },
  };
}

/**
 * Verify signature using timing-safe comparison
 */
function verifySignature(
  signature: string,
  profileId: string,
  timestamp: number
): boolean {
  const expectedSignature = generateSignature(profileId, timestamp);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  return (
    signatureBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

/**
 * Check if tracking token validation is enabled
 */
export function isTrackingTokenEnabled(): boolean {
  return Boolean(getTrackingSecret());
}

/**
 * Generate HMAC-SHA256 signature for a payload
 */
function generateSignature(profileId: string, timestamp: number): string {
  const secret = getTrackingSecret();
  if (!secret) {
    throw new Error('TRACKING_TOKEN_SECRET not configured');
  }

  const data = `${profileId}:${timestamp}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generate a signed tracking token for a profile
 *
 * @param profileId - The creator profile ID
 * @returns Signed token string
 */
export function generateTrackingToken(profileId: string): string {
  if (!isTrackingTokenEnabled()) {
    // Return a placeholder token in development
    if (env.NODE_ENV === 'development') {
      Sentry.addBreadcrumb({
        category: 'tracking-token',
        message: 'TRACKING_TOKEN_SECRET not set - using dev token',
        level: 'warning',
        data: { profileId },
      });
      return `${profileId}:${Date.now()}:dev`;
    }
    throw new Error('Tracking token signing not configured');
  }

  const timestamp = Date.now();
  const signature = generateSignature(profileId, timestamp);

  return `${profileId}:${timestamp}:${signature}`;
}

/**
 * Validate a signed tracking token
 *
 * @param token - The token to validate
 * @param expectedProfileId - Optional: verify the token matches this profile
 * @returns Validation result with payload if valid
 */
export function validateTrackingToken(
  token: string | null | undefined,
  expectedProfileId?: string
): TrackingTokenValidation {
  if (!token) {
    return { valid: false, error: 'Missing token' };
  }

  // In development without secret, allow dev tokens
  if (!isTrackingTokenEnabled()) {
    if (env.NODE_ENV === 'development') {
      return parseDevToken(token, expectedProfileId);
    }
    return { valid: false, error: 'Token validation not configured' };
  }

  // Parse token
  const parts = token.split(':');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }

  const [profileId, timestampStr, signature] = parts;
  const timestamp = Number.parseInt(timestampStr, 10);

  if (Number.isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  // Verify profile ID if expected
  if (expectedProfileId && profileId !== expectedProfileId) {
    return { valid: false, error: 'Profile ID mismatch' };
  }

  // Check token age
  const now = Date.now();
  const age = now - timestamp;

  // Allow for slight clock skew (future tokens)
  if (timestamp > now + MAX_CLOCK_SKEW_MS) {
    return { valid: false, error: 'Token timestamp in future' };
  }

  // Check if token is expired
  if (age > TOKEN_VALIDITY_MS) {
    return { valid: false, error: 'Token expired' };
  }

  // Verify signature using timing-safe comparison
  if (!verifySignature(signature, profileId, timestamp)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return {
    valid: true,
    payload: { profileId, timestamp },
  };
}

/**
 * Express-style middleware to validate tracking tokens
 * For use in API route handlers
 */
export function requireValidTrackingToken(
  token: string | null | undefined,
  profileId: string
): void {
  const validation = validateTrackingToken(token, profileId);

  if (!validation.valid) {
    throw new TrackingTokenError(validation.error ?? 'Invalid token');
  }
}

/**
 * Custom error for tracking token validation failures
 */
export class TrackingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackingTokenError';
  }
}

/**
 * Generate a tracking token for client-side use
 * This should be called server-side and passed to the client
 */
export function getClientTrackingToken(profileId: string): {
  token: string;
  expiresAt: number;
} {
  const token = generateTrackingToken(profileId);
  const expiresAt = Date.now() + TOKEN_VALIDITY_MS;

  return { token, expiresAt };
}
