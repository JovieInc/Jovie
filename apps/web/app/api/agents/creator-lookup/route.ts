import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import {
  NO_STORE_HEADERS,
  RETRY_AFTER_SERVICE,
  RETRY_AFTER_TRANSIENT,
} from '@/lib/http/headers';
import { lookupCreator } from '@/lib/ingestion/creator-lookup';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  agentCreatorLookupLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  url: z
    .string()
    .max(2048)
    .refine(value => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      } catch {
        return false;
      }
    }),
});

function fail(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {}
) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...NO_STORE_HEADERS, ...headers } }
  );
}

function extractionFailure(error: ExtractionError) {
  switch (error.code) {
    case 'NOT_FOUND':
      return fail(404, 'CREATOR_NOT_FOUND', 'Creator profile not found.');
    case 'RATE_LIMITED':
      return fail(
        503,
        'SOURCE_RATE_LIMITED',
        'The source platform is temporarily rate limited.',
        { 'Retry-After': RETRY_AFTER_SERVICE }
      );
    case 'FETCH_TIMEOUT':
      return fail(504, 'SOURCE_TIMEOUT', 'The source platform timed out.', {
        'Retry-After': RETRY_AFTER_TRANSIENT,
      });
    case 'LOGIN_REQUIRED':
      return fail(
        502,
        'SOURCE_LOGIN_WALL',
        "The platform showed a login page instead of this profile. Try the creator's Linktree or YouTube URL."
      );
    case 'EMPTY_RESPONSE':
      return fail(
        502,
        'SOURCE_EMPTY',
        "The platform returned no public profile data. Try the creator's Linktree or YouTube URL."
      );
    default:
      return fail(502, 'LOOKUP_FAILED', 'Creator data could not be extracted.');
  }
}

/** Public, read-only extraction for supported creator profile URLs. */
export async function GET(request: Request) {
  const rateLimit = await agentCreatorLookupLimiter.limit(getClientIP(request));
  if (!rateLimit.success) {
    return rateLimit.unavailable
      ? fail(503, 'TEMPORARILY_UNAVAILABLE', 'Try again shortly.', {
          'Retry-After': RETRY_AFTER_SERVICE,
        })
      : fail(
          429,
          'RATE_LIMITED',
          'Too many creator lookups from this address.',
          createRateLimitHeaders(rateLimit)
        );
  }

  const parsed = querySchema.safeParse({
    url: new URL(request.url).searchParams.get('url'),
  });
  if (!parsed.success) {
    return fail(
      400,
      'VALIDATION_FAILED',
      'Query must include url=<https creator profile URL>.'
    );
  }

  try {
    const creator = await lookupCreator(parsed.data.url);
    if (!creator) {
      return fail(
        422,
        'UNSUPPORTED_URL',
        'Use a YouTube channel, Instagram profile, TikTok profile, or Linktree URL.'
      );
    }

    return NextResponse.json(creator, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ExtractionError) {
      const response = extractionFailure(error);
      if (
        ![
          'NOT_FOUND',
          'RATE_LIMITED',
          'FETCH_TIMEOUT',
          'LOGIN_REQUIRED',
          'EMPTY_RESPONSE',
        ].includes(error.code)
      ) {
        captureError('Agent creator lookup failed', error);
      }
      return response;
    }

    captureError('Agent creator lookup failed', error);
    return fail(502, 'LOOKUP_FAILED', 'Creator data could not be extracted.');
  }
}
