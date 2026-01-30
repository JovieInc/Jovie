import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getFeaturedCreators } from '@/lib/featured-creators';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Health check endpoint for homepage dependencies.
 * Tests featured creators fetch with timeout to detect database issues.
 *
 * Returns:
 * - 200: All checks passed (healthy)
 * - 503: One or more checks failed (degraded/unhealthy)
 */
export async function GET() {
  const startTime = Date.now();
  interface HealthCheck {
    status: 'healthy' | 'unhealthy' | 'unknown';
    duration: number;
    count: number;
    error?: string;
  }

  const health = {
    status: 'healthy' as 'healthy' | 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      featuredCreators: {
        status: 'unknown',
        duration: 0,
        count: 0,
      } as HealthCheck,
    },
  };

  // Check 1: Featured Creators Fetch
  try {
    const dbStart = Date.now();

    // Add 5s timeout to prevent hanging
    const creators = await Promise.race([
      getFeaturedCreators(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Health check timeout after 5s')),
          5000
        )
      ),
    ]);

    health.checks.featuredCreators = {
      status: 'healthy',
      duration: Date.now() - dbStart,
      count: creators.length,
    };
  } catch (error) {
    health.status = 'degraded';
    health.checks.featuredCreators = {
      status: 'unhealthy',
      duration: Date.now() - startTime,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    await captureError(
      'Featured creators check failed in health endpoint',
      error,
      {
        route: '/api/health/homepage',
        checkType: 'featuredCreators',
        duration: Date.now() - startTime,
      }
    );
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json(health, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
