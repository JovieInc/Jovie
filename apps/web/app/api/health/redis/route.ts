import { NextResponse } from 'next/server';

import { getRedis } from '@/lib/redis';

/**
 * GET /api/health/redis
 * Health check endpoint for Redis connection
 *
 * Returns:
 * - 200: Redis is healthy and responding
 * - 503: Redis is unavailable or not configured
 */
export async function GET() {
  const redis = getRedis();

  if (!redis) {
    return NextResponse.json(
      { status: 'unavailable', error: 'Redis not configured' },
      { status: 503 }
    );
  }

  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;

    return NextResponse.json({
      status: 'healthy',
      latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
