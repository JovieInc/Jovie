/**
 * Cron Job Authentication Utilities
 *
 * Provides timing-safe authentication for cron job endpoints to prevent
 * timing attacks that could be used to guess the CRON_SECRET.
 *
 * IMPORTANT: All cron endpoints should use verifyCronSecret() instead of
 * direct string comparison with ===.
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Timing-safe comparison of cron secret to prevent timing attacks.
 *
 * Uses crypto.timingSafeEqual which executes in constant time regardless
 * of how many characters match, preventing attackers from measuring response
 * times to guess the secret character by character.
 *
 * @param provided - The secret provided in the request
 * @param expected - The expected secret from environment
 * @returns true if the secrets match
 */
export function timingSafeCompare(
  provided: string | undefined,
  expected: string | undefined
): boolean {
  if (!expected || !provided) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  // Length check must be done before timingSafeEqual
  // Even though this leaks length, it's still safer than direct comparison
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Verify the cron secret from a request's Authorization header.
 *
 * This function:
 * 1. Extracts the Bearer token from the Authorization header
 * 2. Compares it against CRON_SECRET using timing-safe comparison
 * 3. Works in ALL environments (not just production)
 *
 * @param request - The incoming request
 * @param secretEnvVar - Optional custom secret env var (defaults to CRON_SECRET)
 * @returns true if the request is authorized
 */
export function verifyCronSecret(
  request: Request | NextRequest,
  secretEnvVar?: string
): boolean {
  const expected = secretEnvVar ?? process.env.CRON_SECRET;

  if (!expected) {
    console.error('[cron-auth] CRON_SECRET is not configured');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  const provided = authHeader?.replace('Bearer ', '');

  return timingSafeCompare(provided, expected);
}

/**
 * Verify the cron secret from a custom header (e.g., x-ingestion-secret).
 *
 * @param request - The incoming request
 * @param headerName - The header name to check
 * @param secretEnvVar - The secret to compare against
 * @returns true if the request is authorized
 */
export function verifyCronSecretFromHeader(
  request: Request | NextRequest,
  headerName: string,
  secretEnvVar: string | undefined
): boolean {
  if (!secretEnvVar) {
    console.error(
      `[cron-auth] Secret for header ${headerName} is not configured`
    );
    return false;
  }

  const provided = request.headers.get(headerName);
  return timingSafeCompare(provided ?? undefined, secretEnvVar);
}
