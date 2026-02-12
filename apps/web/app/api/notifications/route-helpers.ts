import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { createRateLimitHeaders } from '@/lib/rate-limit';
import type { RateLimitResult } from '@/lib/rate-limit';

const RATE_LIMITED_RESPONSE = {
  success: false,
  error: 'Too many requests. Please wait and try again.',
  code: 'rate_limited',
} as const;

const SERVER_ERROR_RESPONSE = {
  success: false,
  error: 'Server error',
  code: 'server_error',
} as const;

export function createNotificationJsonResponse(
  body: unknown,
  status: number,
  rateLimitResult: RateLimitResult
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...createRateLimitHeaders(rateLimitResult),
    },
  });
}

export function createRateLimitedResponse(rateLimitResult: RateLimitResult) {
  return createNotificationJsonResponse(RATE_LIMITED_RESPONSE, 429, rateLimitResult);
}

export function createServerErrorResponse(rateLimitResult: RateLimitResult) {
  return createNotificationJsonResponse(SERVER_ERROR_RESPONSE, 500, rateLimitResult);
}
