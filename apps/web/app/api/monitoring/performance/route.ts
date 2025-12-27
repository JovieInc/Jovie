import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/api/constants';


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

    // In a real implementation, you would fetch metrics from your database or analytics service
    // For now, we'll return mock data
    const mockMetrics: PerformanceMetric[] = [
      {
        name: 'lcp',
        value: 1250,
        rating: 'good' as const,
        timestamp: Date.now() - 60000,
      },
      {
        name: 'fid',
        value: 45,
        rating: 'good' as const,
        timestamp: Date.now() - 60000,
      },
      {
        name: 'cls',
        value: 0.05,
        rating: 'good' as const,
        timestamp: Date.now() - 60000,
      },
      {
        name: 'fcp',
        value: 950,
        rating: 'good' as const,
        timestamp: Date.now() - 60000,
      },
      {
        name: 'ttfb',
        value: 320,
        rating: 'good' as const,
        timestamp: Date.now() - 60000,
      },
    ];

    return NextResponse.json(
      { metrics: mockMetrics },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch performance metrics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
