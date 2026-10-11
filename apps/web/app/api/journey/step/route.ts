import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SIGNUP_FUNNEL_IDS,
  SIGNUP_FUNNEL_OUTCOMES,
  SIGNUP_FUNNEL_SURFACES,
  type SignupFunnelId,
} from '@/lib/analytics/signup-funnel';
import { recordFunnelStep } from '@/lib/analytics/signup-funnel.server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getClientIP, trackingIpVisitsLimiter } from '@/lib/rate-limit';
import { detectBot } from '@/lib/utils/bot-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1024;

// Server-owned surfaces are never accepted from a browser.
const CLIENT_SURFACES = SIGNUP_FUNNEL_SURFACES.filter(
  surface => surface !== 'server'
) as [string, ...string[]];

const stepSchema = z
  .object({
    funnel: z.enum(SIGNUP_FUNNEL_IDS as [SignupFunnelId, ...SignupFunnelId[]]),
    step: z.string().max(48),
    outcome: z.enum(SIGNUP_FUNNEL_OUTCOMES).optional(),
    surface: z.enum(CLIENT_SURFACES).optional(),
    reason: z.string().max(48).optional(),
  })
  .strict();

const accepted = () =>
  new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });

/**
 * First-party beacon sink for client-only signup funnel steps
 * (signup-funnel/v2). Anonymous and fire-and-forget: bots, rate-limited
 * sources, and a degraded limiter are acknowledged and dropped so the
 * measured product path never sees an error. Nothing identifying is stored.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (detectBot(request, '/api/journey/step').isBot) return accepted();

  const rateLimit = await trackingIpVisitsLimiter.limit(
    `journey:${getClientIP(request)}`
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

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'invalid_payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = stepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // recordFunnelStep ignores steps outside the funnel's ordered list.
  await recordFunnelStep({
    funnel: parsed.data.funnel,
    step: parsed.data.step as never,
    outcome: parsed.data.outcome,
    surface: parsed.data.surface as
      | (typeof SIGNUP_FUNNEL_SURFACES)[number]
      | undefined,
    reason: parsed.data.reason,
  });
  return accepted();
}
