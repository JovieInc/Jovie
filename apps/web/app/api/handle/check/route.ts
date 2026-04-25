import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { RETRY_AFTER_TRANSIENT } from '@/lib/http/headers';
import {
  cacheHandleAvailability,
  getCachedHandleAvailability,
} from '@/lib/onboarding/handle-availability-cache';
import { enforceHandleCheckRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { validateUsername } from '@/lib/validation/username';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Handle Availability Check API
 *
 * Security Measures Implemented:
 * 1. Rate limiting: 30 checks per IP per minute (Redis-backed with in-memory fallback)
 * 2. Constant-time responses: All responses padded to ~100ms to prevent timing attacks
 * 3. Cryptographically secure random jitter: ±10ms jitter to prevent statistical analysis
 *
 * This prevents:
 * - Username enumeration attacks
 * - Timing-based username discovery
 * - Brute-force handle checking
 */

// Target response time in ms (with ±10ms jitter)
const TARGET_RESPONSE_TIME_MS = 100;
const RESPONSE_JITTER_MS = 10;

/**
 * Generate cryptographically secure random jitter.
 * Returns a value between -RESPONSE_JITTER_MS and +RESPONSE_JITTER_MS.
 */
function getSecureJitter(): number {
  // crypto.randomInt generates integers in range [min, max)
  // We want -10 to +10, so generate 0-20 and subtract 10
  return crypto.randomInt(0, RESPONSE_JITTER_MS * 2 + 1) - RESPONSE_JITTER_MS;
}

/**
 * Calculate delay needed to reach constant response time.
 * Uses cryptographically secure random jitter to prevent statistical analysis.
 */
function calculateConstantTimeDelay(startTime: number): number {
  const elapsed = Date.now() - startTime;
  const jitter = getSecureJitter();
  const targetTime = TARGET_RESPONSE_TIME_MS + jitter;
  return Math.max(0, targetTime - elapsed);
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  // Helper to return response with constant timing
  const respondWithConstantTime = async (
    body: object,
    options?: { status?: number; headers?: Record<string, string> }
  ) => {
    const delay = calculateConstantTimeDelay(startTime);
    if (delay > 0) {
      await sleep(delay);
    }
    return NextResponse.json(body, {
      status: options?.status ?? 200,
      headers: { ...NO_STORE_HEADERS, ...options?.headers },
    });
  };

  if (!handle) {
    return respondWithConstantTime(
      { available: false, error: 'Handle is required' },
      { status: 400 }
    );
  }

  // Validate handle format using the canonical shared validator so this API
  // accepts the same inputs as the onboarding form and completeOnboarding
  // server action. Previously this route used a stricter local regex that
  // rejected dots and underscores, even though those characters are allowed
  // throughout the rest of the system — users would see a "green" client-side
  // validation for "my.handle" but then get blocked here with a confusing
  // "letters, numbers, and hyphens" error.
  //
  // Wrapped in try/catch so that an unexpected throw from the validator
  // (e.g. content-filter loaded at runtime) still produces a constant-time
  // response rather than bypassing the constant-time guarantee with a 500.
  //
  // A validator throw is a transient internal failure, not bad client input,
  // so return 503 — a 400 here would mislead clients into believing their
  // input was rejected and hide incident semantics from monitoring.
  let formatCheck: { isValid: boolean; error?: string };
  try {
    formatCheck = validateUsername(handle);
  } catch (error) {
    await captureError('validateUsername threw', error, {
      handle,
      route: '/api/handle/check',
    });
    return respondWithConstantTime(
      { available: false, error: 'Handle check temporarily unavailable' },
      { status: 503 }
    );
  }
  if (!formatCheck.isValid) {
    // `validateUsername` always populates `error` on the `isValid: false`
    // branch (see `validateUsernameCore`), so no runtime fallback is needed.
    return respondWithConstantTime(
      { available: false, error: formatCheck.error },
      { status: 400 }
    );
  }

  try {
    // Rate limit check using Redis-backed limiter
    const headersList = await headers();
    const ip = extractClientIP(headersList);
    await enforceHandleCheckRateLimit(ip);

    const handleLower = handle.toLowerCase();

    const cachedAvailability = await getCachedHandleAvailability(handleLower);
    if (cachedAvailability !== null) {
      return respondWithConstantTime({ available: cachedAvailability });
    }

    // Add timeout to prevent hanging on database issues
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let data: Array<{ username: string }>;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Database timeout')), 3000); // 3 second timeout
      });

      data = await Promise.race([
        db
          .select({ username: creatorProfiles.username })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.usernameNormalized, handleLower))
          .limit(1),
        timeoutPromise,
      ]);
    } finally {
      if (timerId !== undefined) clearTimeout(timerId);
    }

    const isAvailable = !data || data.length === 0;
    await cacheHandleAvailability(handleLower, isAvailable);

    // SECURITY: Return with constant timing to prevent timing attacks
    // An attacker cannot determine if a handle exists based on response time
    return respondWithConstantTime({ available: isAvailable });
  } catch (error: unknown) {
    await captureError('Error checking handle availability', error, {
      handle,
      route: '/api/handle/check',
    });

    // Handle rate limiting - still use constant time
    if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
      return respondWithConstantTime(
        { available: false, error: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    // Handle timeout - return error instead of mock data
    if (
      (error as Error)?.message?.includes('timeout') ||
      (error as Error)?.message?.includes('Database timeout')
    ) {
      return respondWithConstantTime(
        { available: false, error: 'Service temporarily unavailable' },
        { status: 503, headers: { 'Retry-After': RETRY_AFTER_TRANSIENT } }
      );
    }

    return respondWithConstantTime(
      { available: false, error: 'Database connection failed' },
      { status: 500 }
    );
  }
}
