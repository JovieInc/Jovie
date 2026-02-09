import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Define metric shape
interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

// Define the response shape
interface PerformanceResponse {
  metrics?: PerformanceMetric[];
  error?: string;
}

/**
 * GET handler for performance metrics API
 * This endpoint is protected and only accessible to authenticated users
 */
export async function GET(): Promise<NextResponse<PerformanceResponse>> {
  try {
    // Check authentication
    const { userId } = await auth();

    // Only allow authenticated users
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Performance metrics endpoint is not yet implemented
    // See JOV-480: Integrate with analytics service (Vercel Analytics, Sentry)
    return NextResponse.json(
      { error: 'Performance metrics not yet available', metrics: [] },
      { status: 501, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error fetching performance metrics:', error);
    await captureError('Performance monitoring failed', error, {
      route: '/api/monitoring/performance',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
