import 'server-only';

import { NextResponse } from 'next/server';
import {
  createRateLimitHeaders,
  type RateLimitResult,
  rateLimitDenialMessage,
  rateLimitDenialStatus,
} from '@/lib/rate-limit';
import type { RateLimitStage, RouteStageInput } from './route-pipeline';

interface Limiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

/**
 * Standard limiter stage: 429 when exhausted, 503 when the limiter backend is
 * unavailable, both with rate limit headers.
 */
export function rateLimitBy<TAuth>(options: {
  limiter: Limiter;
  key: (input: RouteStageInput<TAuth>) => string;
  message?: string;
}): RateLimitStage<TAuth> {
  return async input => {
    const result = await options.limiter.limit(options.key(input));
    if (result.success) return null;
    return NextResponse.json(
      {
        error: rateLimitDenialMessage(
          result,
          options.message ?? 'Too many requests. Please try again in a moment.'
        ),
      },
      {
        status: rateLimitDenialStatus(result),
        headers: {
          ...input.responseHeaders,
          ...createRateLimitHeaders(result),
        },
      }
    );
  };
}
