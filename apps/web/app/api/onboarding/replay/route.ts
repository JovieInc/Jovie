import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  recordSignupReplay,
  SENTRY_REPLAY_ID_PATTERN,
} from '@/lib/analytics/signup-replay.server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getCurrentOnboardingSessionId } from '@/lib/onboarding/session';
import { getClientIP, trackingIpVisitsLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 256;

const bodySchema = z
  .object({ replayId: z.string().regex(SENTRY_REPLAY_ID_PATTERN) })
  .strict();

const accepted = () =>
  new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });

/**
 * The browser reports the id of its own Sentry replay. The server attaches
 * the identity it can verify itself (signed onboarding cookie, signed-in
 * user); the body never names a user. Fire-and-forget and internal-only: bots,
 * rate-limited sources and visitors with no verifiable identity are
 * acknowledged and dropped.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (detectBot(request, '/api/onboarding/replay').isBot) return accepted();

  const rateLimit = await trackingIpVisitsLimiter.limit(
    `replay-link:${getClientIP(request)}`
  );
  if (!rateLimit.success || rateLimit.degraded || rateLimit.unavailable) {
    return accepted();
  }

  const raw = await request.text().catch(() => '');
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: 'invalid_payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  let parsed: ReturnType<typeof bodySchema.safeParse>;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    parsed = bodySchema.safeParse(null);
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const [onboardingSessionId, { userId }] = await Promise.all([
      getCurrentOnboardingSessionId(),
      getCachedAuth(),
    ]);
    await recordSignupReplay({
      replayId: parsed.data.replayId,
      onboardingSessionId,
      userId,
    });
  } catch (error) {
    await captureError('Signup replay link failed', error, {
      route: '/api/onboarding/replay',
    });
  }
  return accepted();
}
