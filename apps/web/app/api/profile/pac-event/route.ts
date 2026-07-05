import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createRateLimitedResponse } from '@/app/api/notifications/route-helpers';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import { trackEvent } from '@/lib/analytics/runtime-aware';
import { captureError } from '@/lib/error-tracking';
import { logStatsigEvent } from '@/lib/flags/statsig';
import { generalLimiter, getClientIP } from '@/lib/rate-limit';
import {
  PAC_IDENTITY_BLOCKED_CONSENTS,
  pacEventBeaconSchema,
} from '@/lib/tracking/pac-events-contract';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 4096;

/**
 * First-party sink for PAC (Primary Action Card) instrumentation events —
 * spec §8 (issue #13063).
 *
 * Anonymous, public, fire-and-forget (clients post via sendBeacon). The
 * route is authoritative for identity: it derives `jv_aid` from the
 * httpOnly cookie server-side, and only when the visitor's consent state
 * permits identity joining (GPC opt-out / rejected consent stay anonymous
 * but still count toward session-scoped experiment denominators).
 *
 * Accepted events are forwarded to Statsig (variant-keyed arm metrics for
 * the PAC auto-promotion loop) and the server-side analytics path. No new
 * third-party analytics.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const clientIp = getClientIP(request);
    const rateLimitResult = await generalLimiter.limit(clientIp);
    if (!rateLimitResult.success) {
      return createRateLimitedResponse(rateLimitResult);
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Payload exceeds the 4KB PAC event limit' },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: 'Request body must be valid JSON' },
        { status: 400 }
      );
    }

    const parsed = pacEventBeaconSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid PAC event payload',
          issues: parsed.error.issues.map(
            issue => `${issue.path.join('.') || 'payload'}: ${issue.message}`
          ),
        },
        { status: 400 }
      );
    }

    const event = parsed.data;
    const identityAllowed = !PAC_IDENTITY_BLOCKED_CONSENTS.includes(
      event.consent
    );
    const cookieStore = await cookies();
    const jvAid = identityAllowed
      ? (cookieStore.get(AUDIENCE_ANON_COOKIE)?.value ?? null)
      : null;

    const record = {
      event: event.event,
      jv_aid: jvAid,
      profile_id: event.profile_id,
      pac_state: event.pac_state,
      variant_id: event.variant_id,
      session_id: event.session_id,
      consent: event.consent,
      ts: event.ts,
      ...(event.extras ? { extras: event.extras } : {}),
    };

    // Statsig user: stable jv_aid when identity is allowed (matches how the
    // PAC assignment itself is keyed), anonymous session scope otherwise.
    const statsigUserId = jvAid ?? `pac-session:${event.session_id}`;
    const statsigMetadata: Record<string, string> = {
      profile_id: event.profile_id,
      pac_state: event.pac_state,
      variant_id: event.variant_id,
      session_id: event.session_id,
      consent: event.consent,
      ...(event.extras
        ? Object.fromEntries(
            Object.entries(event.extras).map(([key, value]) => [
              `extra_${key}`,
              String(value),
            ])
          )
        : {}),
    };

    // Both are fail-safe and must never block the beacon response.
    void logStatsigEvent(
      statsigUserId,
      event.event,
      event.variant_id,
      statsigMetadata
    );
    void trackEvent(event.event, record);

    logger.info('[pac-event] accepted', record);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error('[api/profile/pac-event] Ingest failed:', error);
    await captureError('PAC event ingest failed', error, {
      route: '/api/profile/pac-event',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
