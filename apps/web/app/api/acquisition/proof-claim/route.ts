import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isProofClaimFunnelEvent,
  PROOF_CLAIM_FUNNEL_EVENTS,
} from '@/lib/acquisition/proof-claim-funnel';
import { recordProofClaimFunnelEvent } from '@/lib/acquisition/proof-claim-funnel.server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { trackingIpClicksLimiter } from '@/lib/rate-limit';
import { trackingLimiterResponse } from '@/lib/rate-limit/tracking-outage';
import { extractClientIP } from '@/lib/utils/ip-extraction';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const bodySchema = z.object({
  eventType: z.enum([
    PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED,
    PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED,
    PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT,
    PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION,
  ]),
  destination: z.string().max(500).optional(),
  label: z.string().max(120).optional(),
  profile_handle: z.string().max(80).optional(),
});

export async function POST(request: NextRequest) {
  const ipAddress = extractClientIP(request.headers);
  // optionalDrop telemetry: durable Redis when healthy; ack+drop on outage
  // rather than 429 or per-instance memory (SEC-04 / tracking outage policy).
  const rateLimitResult = await trackingIpClicksLimiter.limit(ipAddress);
  const limited = trackingLimiterResponse(rateLimitResult, {
    dropBody: { ok: true, dropped: true },
    dropStatus: 202,
    throttleBody: {
      error: 'Too many tracking requests. Please try again later.',
    },
  });
  if (limited) {
    return limited;
  }

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isProofClaimFunnelEvent(parsed.data.eventType)) {
      return NextResponse.json(
        { error: 'Invalid proof-claim event' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await recordProofClaimFunnelEvent(parsed.data.eventType, {
      destination: parsed.data.destination,
      label: parsed.data.label,
      profileHandle: parsed.data.profile_handle,
    });

    return NextResponse.json(
      { ok: true },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to record proof-claim event', error, {
      route: '/api/acquisition/proof-claim',
    });
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error, 'Failed to record proof-claim event'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
