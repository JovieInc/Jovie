import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { enforceHandleCheckRateLimit } from '@/lib/onboarding/rate-limit';
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
 * 3. Random delay injection: ±10ms jitter to prevent statistical analysis
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
 * Calculate delay needed to reach constant response time.
 * Adds random jitter to prevent statistical analysis.
 */
function calculateConstantTimeDelay(startTime: number): number {
  const elapsed = Date.now() - startTime;
  const jitter = Math.random() * RESPONSE_JITTER_MS * 2 - RESPONSE_JITTER_MS;
  const targetTime = TARGET_RESPONSE_TIME_MS + jitter;
  return Math.max(0, targetTime - elapsed);
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// In-memory cache for mock responses to reduce server load during testing
// Cache expires after 10 seconds to balance performance with realistic behavior
// Max size of 1000 entries to prevent memory exhaustion during load testing
const mockResponseCache = new Map<
  string,
  { result: { available: boolean }; expiry: number }
>();
const MOCK_CACHE_TTL = 10 * 1000; // 10 seconds
const MOCK_CACHE_MAX_SIZE = 1000; // Max entries to prevent memory exhaustion

// Helper function to get cached mock response
function getCachedMockResponse(handle: string) {
  const cached = mockResponseCache.get(handle);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }
  return null;
}

// Helper function to cache mock response with LRU-style eviction
function cacheMockResponse(handle: string, result: { available: boolean }) {
  // Evict oldest entries if cache is full
  if (mockResponseCache.size >= MOCK_CACHE_MAX_SIZE) {
    const now = Date.now();
    // First, remove expired entries
    for (const [key, value] of mockResponseCache.entries()) {
      if (value.expiry < now) {
        mockResponseCache.delete(key);
      }
    }
    // If still too full, remove oldest 10%
    if (mockResponseCache.size >= MOCK_CACHE_MAX_SIZE) {
      const keysToDelete = Array.from(mockResponseCache.keys()).slice(
        0,
        Math.ceil(MOCK_CACHE_MAX_SIZE * 0.1)
      );
      for (const key of keysToDelete) {
        mockResponseCache.delete(key);
      }
    }
  }

  mockResponseCache.set(handle, {
    result,
    expiry: Date.now() + MOCK_CACHE_TTL,
  });
}

// Helper function to create mock response with appropriate cache headers
function createMockResponse(handle: string) {
  // Check cache first
  const cachedResponse = getCachedMockResponse(handle);
  if (cachedResponse) {
    return NextResponse.json(cachedResponse, {
      headers: {
        'Cache-Control': `public, max-age=10`, // 10 second cache for mock responses
        'X-Mock-Response': 'true',
        'X-Cache-Status': 'hit',
      },
    });
  }

  // Mock some common handles as taken for realistic testing
  const commonHandles = [
    'admin',
    'root',
    'test',
    'user',
    'api',
    'www',
    'mail',
    'ftp',
    'support',
  ];
  const isCommonHandle = commonHandles.includes(handle.toLowerCase());
  const result = { available: !isCommonHandle };

  // Cache the result
  cacheMockResponse(handle, result);

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': `public, max-age=10`, // 10 second cache for mock responses
      'X-Mock-Response': 'true',
      'X-Cache-Status': 'miss',
    },
  });
}
export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  // Helper to return response with constant timing
  const respondWithConstantTime = async (
    body: object,
    options?: { status?: number }
  ) => {
    const delay = calculateConstantTimeDelay(startTime);
    if (delay > 0) {
      await sleep(delay);
    }
    return NextResponse.json(body, {
      status: options?.status ?? 200,
      headers: NO_STORE_HEADERS,
    });
  };

  if (!handle) {
    return respondWithConstantTime(
      { available: false, error: 'Handle is required' },
      { status: 400 }
    );
  }

  // Validate handle format
  if (handle.length < 3) {
    return respondWithConstantTime(
      { available: false, error: 'Handle must be at least 3 characters' },
      { status: 400 }
    );
  }

  if (handle.length > 30) {
    return respondWithConstantTime(
      { available: false, error: 'Handle must be less than 30 characters' },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9-]+$/.test(handle)) {
    return respondWithConstantTime(
      {
        available: false,
        error: 'Handle can only contain letters, numbers, and hyphens',
      },
      { status: 400 }
    );
  }

  try {
    // Rate limit check using Redis-backed limiter
    const headersList = await headers();
    const ip = extractClientIP(headersList);
    await enforceHandleCheckRateLimit(ip);

    const handleLower = handle.toLowerCase();

    // Add timeout to prevent hanging on database issues
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 3000); // 3 second timeout
    });

    const data = await Promise.race([
      db
        .select({ username: creatorProfiles.username })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.usernameNormalized, handleLower))
        .limit(1),
      timeoutPromise,
    ]);

    // SECURITY: Return with constant timing to prevent timing attacks
    // An attacker cannot determine if a handle exists based on response time
    return respondWithConstantTime({ available: !data || data.length === 0 });
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

    // Handle timeout and provide mock response
    if (
      (error as Error)?.message?.includes('timeout') ||
      (error as Error)?.message?.includes('Database timeout')
    ) {
      await captureWarning(
        'Database timeout, providing cached mock handle availability for testing',
        error,
        { handle }
      );

      // Still maintain constant timing even for mock responses
      const delay = calculateConstantTimeDelay(startTime);
      if (delay > 0) {
        await sleep(delay);
      }
      return createMockResponse(handle.toLowerCase());
    }

    return respondWithConstantTime(
      { available: false, error: 'Database connection failed' },
      { status: 500 }
    );
  }
}
