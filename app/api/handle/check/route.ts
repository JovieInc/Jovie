import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { enforceOnboardingRateLimit } from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

/**
 * Handle Availability Check API
 *
 * Rate Limiting Status: NOT IMPLEMENTED
 * Following YC principle: "do things that don't scale until you have to"
 * Will add rate limiting when:
 * - Handle checks exceed ~100k/day
 * - Enumeration abuse becomes measurable problem
 *
 * Known Security Issue: Username Enumeration
 * This endpoint allows checking if a handle exists, which could enable enumeration attacks.
 * Mitigation strategies for future:
 * - Add rate limiting (per IP and per session)
 * - Add small random delay to responses
 * - Return same response time for available/unavailable
 * - Implement CAPTCHA after N failed checks
 *
 * For now: Basic input validation prevents most abuse. Monitor PostHog events for patterns.
 */

// In-memory cache for mock responses to reduce server load during testing
// Cache expires after 10 seconds to balance performance with realistic behavior
const mockResponseCache = new Map<
  string,
  { result: { available: boolean }; expiry: number }
>();
const MOCK_CACHE_TTL = 10 * 1000; // 10 seconds

// Helper function to get cached mock response
function getCachedMockResponse(handle: string) {
  const cached = mockResponseCache.get(handle);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }
  return null;
}

// Helper function to cache mock response
function cacheMockResponse(handle: string, result: { available: boolean }) {
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
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle');

  if (!handle) {
    return NextResponse.json(
      { available: false, error: 'Handle is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Validate handle format
  if (handle.length < 3) {
    return NextResponse.json(
      { available: false, error: 'Handle must be at least 3 characters' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (handle.length > 30) {
    return NextResponse.json(
      { available: false, error: 'Handle must be less than 30 characters' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!/^[a-zA-Z0-9-]+$/.test(handle)) {
    return NextResponse.json(
      {
        available: false,
        error: 'Handle can only contain letters, numbers, and hyphens',
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    // Lightweight rate limit to reduce enumeration; uses same buckets as onboarding
    const headersList = await headers();
    const ip = extractClientIP(headersList);
    // We don't have a userId here; namespace with IP only
    await enforceOnboardingRateLimit({
      userId: 'handle-check',
      ip,
      checkIP: true,
    });

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

    return NextResponse.json(
      { available: !data || data.length === 0 },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error: unknown) {
    await captureError('Error checking handle availability', error, {
      handle,
      route: '/api/handle/check',
    });

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

      return createMockResponse(handle.toLowerCase());
    }

    return NextResponse.json(
      { available: false, error: 'Database connection failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
