import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { RateLimitResult } from './types';
import { createRateLimitHeaders } from './utils';

/**
 * optionalDrop gate for tracking limiters that set requireRedis.
 * Healthy Redis denials stay 429; Redis outages ack+drop (no memory fallback).
 */
export function trackingLimiterResponse(
  result: RateLimitResult,
  options: {
    readonly dropBody: Record<string, unknown>;
    readonly dropStatus?: number;
    readonly throttleBody: Record<string, unknown>;
  }
): NextResponse | null {
  if (result.success) {
    return null;
  }
  if (result.unavailable === true || result.degraded === true) {
    return NextResponse.json(options.dropBody, {
      status: options.dropStatus ?? 200,
      headers: NO_STORE_HEADERS,
    });
  }
  return NextResponse.json(options.throttleBody, {
    status: 429,
    headers: {
      ...NO_STORE_HEADERS,
      ...createRateLimitHeaders(result),
    },
  });
}
