import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  countPeriodFlushes,
  REPLAY_FLUSH_TRIGGERS,
  REPLAY_MONTHLY_CAP,
  recordReplayFlush,
  recordSignupReplay,
  resolveServerFlushTrigger,
  SENTRY_REPLAY_ID_PATTERN,
} from '@/lib/analytics/signup-replay.server';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getCurrentOnboardingSessionId } from '@/lib/onboarding/session';
import { getClientIP, trackingIpVisitsLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';

const MAX_BODY_BYTES = 256;

const bodySchema = z
  .object({
    replayId: z.string().regex(SENTRY_REPLAY_ID_PATTERN),
    trigger: z.enum(REPLAY_FLUSH_TRIGGERS).optional(),
  })
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
    const { replayId, trigger } = parsed.data;

    // The browser flushed its buffer for a trigger: count it against the cap.
    if (trigger) {
      const counted = await recordReplayFlush({
        replayId,
        trigger,
        onboardingSessionId,
        userId,
      });
      return NextResponse.json(
        { flushed: counted },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Plain link report: attach identity, say whether a flush is allowed, and
    // name a success-path trigger when the server has seen a new account.
    const row = await recordSignupReplay({
      replayId,
      onboardingSessionId,
      userId,
    });
    const canFlush = (await countPeriodFlushes()) < REPLAY_MONTHLY_CAP;
    const flush = canFlush ? await resolveServerFlushTrigger(row) : null;
    return NextResponse.json(
      { canFlush, flush },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Signup replay link failed', error, {
      route: '/api/onboarding/replay',
    });
    return accepted();
  }
}
