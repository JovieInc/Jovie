import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import {
  NO_STORE_HEADERS,
  RETRY_AFTER_SERVICE,
  RETRY_AFTER_TRANSIENT,
} from '@/lib/http/headers';
import {
  lookupCreator,
  validateCreatorUrl,
} from '@/lib/ingestion/creator-lookup';
import { findProfileForSource } from '@/lib/ingestion/creator-profile-match';
import { ExtractionError } from '@/lib/ingestion/strategies/base';
import {
  agentCreatorLookupLimiter,
  createRateLimitHeaders,
  getClientIP,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC_PROFILE_RECOVERY =
  "If the creator has an existing public Jovie profile, run `jovie artist get` followed by that profile's exact Jovie username. A social handle may belong to someone else on Jovie.";

const UNSUPPORTED_URL_MESSAGE = `This URL is not supported for creator lookup. ${PUBLIC_PROFILE_RECOVERY}`;

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
        `The platform showed a login page instead of this profile. ${PUBLIC_PROFILE_RECOVERY}`
      );
    case 'SOCIAL_HTML_DISABLED':
      return fail(
        422,
        'SOURCE_UNSUPPORTED',
        `Fresh profile extraction is unavailable for this source because Jovie does not read this platform's pages from its servers. ${PUBLIC_PROFILE_RECOVERY}`
      );
    case 'EMPTY_RESPONSE':
      return fail(
        502,
        'SOURCE_EMPTY',
        `The platform returned no public profile data. ${PUBLIC_PROFILE_RECOVERY}`
      );
    default:
      return fail(502, 'LOOKUP_FAILED', 'Creator data could not be extracted.');
  }
}

/** Read an existing linked profile before attempting available extraction. */
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

  const validated = validateCreatorUrl(parsed.data.url);
  if (!validated) {
    return fail(422, 'UNSUPPORTED_URL', UNSUPPORTED_URL_MESSAGE);
  }

  try {
    const existing = await findProfileForSource(
      validated.platform,
      validated.sourceUrl
    );
    if (existing) {
      return NextResponse.json(
        {
          platform: validated.platform,
          sourceUrl: validated.sourceUrl,
          exists: true,
          ...existing,
        },
        { headers: NO_STORE_HEADERS }
      );
    }
  } catch (error) {
    // A profile-match outage must not blind the extraction fallback.
    captureError('Agent creator lookup profile match failed', error);
  }

  try {
    const creator = await lookupCreator(parsed.data.url);
    if (!creator) {
      return fail(422, 'UNSUPPORTED_URL', UNSUPPORTED_URL_MESSAGE);
    }

    return NextResponse.json(
      { ...creator, exists: false },
      { headers: NO_STORE_HEADERS }
    );
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
          'SOCIAL_HTML_DISABLED',
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
