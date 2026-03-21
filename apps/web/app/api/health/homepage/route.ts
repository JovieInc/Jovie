import { NextResponse } from 'next/server';
import { captureWarning } from '@/lib/error-tracking';
import { getFeaturedCreators } from '@/lib/featured-creators';
import { withTimeout } from '@/lib/resilience/primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const HOMEPAGE_HEALTH_TIMEOUT_MS = 5000;

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

    const creators = await withTimeout(getFeaturedCreators(), {
      timeoutMs: HOMEPAGE_HEALTH_TIMEOUT_MS,
      context: 'Homepage featured creators health check',
      timeoutMessage: 'Health check timeout after 5s',
    });

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

    void captureWarning(
      'Featured creators check failed in health endpoint',
      error,
      {
        service: 'homepage',
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
