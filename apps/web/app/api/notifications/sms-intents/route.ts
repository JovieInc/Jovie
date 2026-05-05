import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  getSmsConsentTextHash,
  SMS_CONSENT_VERSION,
} from '@/lib/notifications/sms-consent';
import {
  createIntent,
  hashIpAddress,
  hashUserAgent,
} from '@/lib/notifications/sms-intents';
import {
  createRateLimiter,
  createRateLimitHeaders,
  generalLimiter,
  getClientIP,
} from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import { smsIntentCreateSchema } from '@/lib/validation/schemas/notifications';

export const runtime = 'nodejs';

/**
 * Per-IP / per-artist / per-visitor rate limits per autoplan decision row #38
 * (codex F13). The plan calls for:
 *   30/min/IP, 5/min/artist/IP, 100/min/artist global, 20/min/visitorId.
 * We split into 3 limiters keyed appropriately.
 */
const intentCreateIpLimiter = createRateLimiter({
  name: 'SMS Intent Create (per IP)',
  limit: 30,
  window: '1 m',
  prefix: 'notifications:sms-intent:create:ip',
  analytics: true,
});

const intentCreateArtistGlobalLimiter = createRateLimiter({
  name: 'SMS Intent Create (per artist global)',
  limit: 100,
  window: '1 m',
  prefix: 'notifications:sms-intent:create:artist',
  analytics: true,
});

const intentCreateVisitorLimiter = createRateLimiter({
  name: 'SMS Intent Create (per visitor)',
  limit: 20,
  window: '1 m',
  prefix: 'notifications:sms-intent:create:visitor',
  analytics: true,
});

function buildSmsHref(
  fromNumber: string | null | undefined,
  code: string
): string | null {
  if (!fromNumber) return null;
  // sms: URI per RFC 5724. Body encoded for cross-platform compatibility.
  // The frontend may rebuild this with `&body` for iOS or `?body` for some
  // Android variants per codex F18 / decision row #43.
  const body = encodeURIComponent(`JOIN ${code}`);
  return `sms:${fromNumber}?&body=${body}`;
}

function isFlagEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request) ?? 'unknown';

  if (!isFlagEnabled(env.NATIVE_SMS_ENABLED)) {
    return NextResponse.json(
      {
        success: false,
        error: 'SMS subscribe not available',
        code: 'sms_disabled',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const baseLimit = await generalLimiter.limit(ip);
  if (!baseLimit.success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(baseLimit) },
      }
    );
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const result = smsIntentCreateSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const input = result.data;

  // Per-IP + per-artist + per-visitor limits applied in parallel.
  const visitorId =
    request.cookies.get(AUDIENCE_IDENTIFIED_COOKIE)?.value ?? null;

  const [ipResult, artistResult, visitorResult] = await Promise.all([
    intentCreateIpLimiter.limit(ip),
    intentCreateArtistGlobalLimiter.limit(input.artist_id),
    visitorId
      ? intentCreateVisitorLimiter.limit(visitorId)
      : Promise.resolve({ success: true } as const),
  ]);

  if (!ipResult.success || !artistResult.success || !visitorResult.success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests', code: 'rate_limited' },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  const artistRows = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, input.artist_id))
    .limit(1);
  if (artistRows.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Artist not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
  const artist = artistRows[0];

  // US-only enforcement happens at the UI layer via server-side geo-detect
  // (decision row #21). The API is a soft secondary guard — we capture the
  // visitor's geo header for analytics but don't reject here.
  const requestCountryCode =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry');

  const ipHash = hashIpAddress(ip);
  const userAgentHash = hashUserAgent(
    request.headers.get('user-agent') ?? null
  );

  try {
    const { intent, code } = await createIntent({
      creatorProfileId: artist.id,
      visitorId,
      source: input.source,
      sourceUrl: input.source_url ?? null,
      countryCode: requestCountryCode,
      consentTextHash: getSmsConsentTextHash(),
      consentVersion: SMS_CONSENT_VERSION,
      ipHash,
      userAgentHash,
    });

    return NextResponse.json(
      {
        success: true,
        intent_id: intent.id,
        code,
        sms_href: buildSmsHref(env.TWILIO_FROM_NUMBER ?? null, code),
        sms_to: env.TWILIO_FROM_NUMBER ?? null,
        expires_at: intent.expiresAt.toISOString(),
        consent_version: SMS_CONSENT_VERSION,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    captureError('SMS intent creation failed', error, {
      artistId: input.artist_id,
    });
    logger.error('SMS intent creation failed', { artistId: input.artist_id });
    return NextResponse.json(
      { success: false, error: 'Server error', code: 'server_error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
