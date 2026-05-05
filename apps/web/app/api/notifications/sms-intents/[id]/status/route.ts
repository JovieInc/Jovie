import { type NextRequest, NextResponse } from 'next/server';
import { AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  computeIntentFingerprint,
  getIntentById,
  hashIpAddress,
  hashUserAgent,
  verifyIntentFingerprint,
} from '@/lib/notifications/sms-intents';
import { createRateLimiter, getClientIP } from '@/lib/rate-limit';
import { maskPhoneForDisplay } from '@/lib/utils/pii';

export const runtime = 'nodejs';

const intentStatusLimiter = createRateLimiter({
  name: 'SMS Intent Status (per IP)',
  limit: 90,
  window: '1 m',
  prefix: 'notifications:sms-intent:status:ip',
  analytics: true,
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const ip = getClientIP(request) ?? 'unknown';
  const limit = await intentStatusLimiter.limit(ip);
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json(
      { success: false, error: 'Invalid intent id' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Load the intent by id without any fingerprint check so we can read
  // creatorProfileId. Fingerprint enforcement is then artist-scoped — see
  // codex F12 / decision row #53. Phone PII is only revealed when the
  // request fingerprint matches the stored one.
  const intent = await getIntentById(id);
  if (!intent) {
    return NextResponse.json(
      {
        success: true,
        status: 'unknown',
        subscribed: false,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const visitorId =
    request.cookies.get(AUDIENCE_IDENTIFIED_COOKIE)?.value ?? null;
  const expectedFingerprint = computeIntentFingerprint({
    visitorId,
    ipHash: hashIpAddress(ip),
    userAgentHash: hashUserAgent(request.headers.get('user-agent') ?? null),
    artistId: intent.creatorProfileId,
  });

  const fingerprintMatches = verifyIntentFingerprint(
    expectedFingerprint,
    intent.fingerprintHash
  );

  const now = Date.now();
  const expired = intent.expiresAt.getTime() <= now;
  const baseStatus =
    intent.status === 'confirmed'
      ? 'confirmed'
      : expired
        ? 'expired'
        : intent.status;

  return NextResponse.json(
    {
      success: true,
      status: baseStatus,
      subscribed: intent.status === 'confirmed',
      phone_masked: fingerprintMatches
        ? maskPhoneForDisplay(intent.phone)
        : null,
      expires_at: intent.expiresAt.toISOString(),
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
