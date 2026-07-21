import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { RETRY_AFTER_TRANSIENT } from '@/lib/http/headers';
import {
  type HandleAvailabilityResult,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import {
  cacheHandleAvailability,
  getCachedHandleAvailability,
} from '@/lib/onboarding/handle-availability-cache';
import { enforceHandleCheckRateLimit } from '@/lib/onboarding/rate-limit';
import { checkOnboardingHandleAvailability } from '@/lib/onboarding/reserved-handle';
import { extractClientIP } from '@/lib/utils/ip-extraction';

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
 * Availability semantics come from `checkOnboardingHandleAvailability` so taken
 * handles always surface explicit `suggestedAlternatives` (never silent swaps).
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

function serializeHandleCheck(result: HandleAvailabilityResult) {
  return {
    available: result.available,
    handle: result.handle,
    reason: result.reason,
    ...(result.error ? { error: result.error } : {}),
    ...(result.suggestedAlternatives && result.suggestedAlternatives.length > 0
      ? { suggestedAlternatives: result.suggestedAlternatives }
      : {}),
  };
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
      serializeHandleCheck(
        toHandleAvailabilityResult({
          handle: '',
          error: 'Handle is required',
        })
      ),
      { status: 400 }
    );
  }

  try {
    // Rate limit check using Redis-backed limiter
    const headersList = await headers();
    const ip = extractClientIP(headersList);
    await enforceHandleCheckRateLimit(ip);

    const handleLower = handle.toLowerCase();

    // Fast path: cached boolean availability still goes through the canonical
    // contract so taken handles expose suggestedAlternatives consistently.
    const cachedAvailability = await getCachedHandleAvailability(handleLower);
    if (cachedAvailability !== null) {
      const cachedResult = toHandleAvailabilityResult({
        handle: handleLower,
        available: cachedAvailability,
      });
      return respondWithConstantTime(serializeHandleCheck(cachedResult));
    }

    // Canonical check (format/reserved/taken + explicit alternatives).
    // Timeout protects against hanging DB issues while preserving constant-time
    // response shape.
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let result: HandleAvailabilityResult;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Database timeout')), 3000);
      });
      result = await Promise.race([
        checkOnboardingHandleAvailability(handle),
        timeoutPromise,
      ]);
    } finally {
      if (timerId !== undefined) clearTimeout(timerId);
    }

    // Only cache definitive available/taken outcomes.
    if (result.reason === 'available' || result.reason === 'taken') {
      await cacheHandleAvailability(result.handle, result.available);
    }

    const status =
      result.reason === 'invalid_format' || result.reason === 'reserved'
        ? 400
        : 200;

    return respondWithConstantTime(serializeHandleCheck(result), { status });
  } catch (error: unknown) {
    await captureError('Error checking handle availability', error, {
      handle,
      route: '/api/handle/check',
    });

    // Handle rate limiting - still use constant time
    if (error instanceof Error && error.message.includes('RATE_LIMITED')) {
      return respondWithConstantTime(
        serializeHandleCheck(
          toHandleAvailabilityResult({
            handle,
            available: false,
            error: 'Too many requests. Please wait.',
          })
        ),
        { status: 429 }
      );
    }

    // Handle timeout - return error instead of mock data
    if (
      (error as Error)?.message?.includes('timeout') ||
      (error as Error)?.message?.includes('Database timeout')
    ) {
      return respondWithConstantTime(
        serializeHandleCheck(
          toHandleAvailabilityResult({
            handle,
            available: false,
            error: 'Service temporarily unavailable',
          })
        ),
        { status: 503, headers: { 'Retry-After': RETRY_AFTER_TRANSIENT } }
      );
    }

    return respondWithConstantTime(
      serializeHandleCheck(
        toHandleAvailabilityResult({
          handle,
          available: false,
          error: 'Database connection failed',
        })
      ),
      { status: 500 }
    );
  }
}
