import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { FORBIDDEN_QUERY_KEYS } from '@/lib/ovie/shipping-state';
import {
  hasCachedConfiguredShippingState,
  publishConfiguredShippingState,
  readCachedConfiguredShippingState,
} from '@/lib/ovie/shipping-state/configured.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Under the 3s client read timeout, with margin for the response. */
const INLINE_REFRESH_WAIT_MS = 2_200;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Start (or join) one coalesced measurement; null if it outlasts `ms`. It keeps running either way. */
async function measureWithin(ms: number) {
  const measuring = publishConfiguredShippingState();
  measuring.catch(() => undefined);
  return Promise.race([
    measuring,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Run one coalesced reconciliation that outlives the response. */
function keepMeasuring(): void {
  scheduleAfter(
    async () => {
      try {
        await publishConfiguredShippingState();
      } catch (error) {
        logger.error(
          '[hud/shipping-state] Background reconciliation failed',
          error
        );
        await captureError('HUD shipping-state reconciliation failed', error, {
          route: '/api/hud/shipping-state',
          method: 'GET',
        });
      }
    },
    {
      // Local packaged dogfood has no Vercel request helper. Start the
      // reconciliation on the same tick while returning cached state first.
      fallback: 'inline',
    }
  );
}

function hasForbiddenQuery(request: NextRequest): boolean {
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (request.nextUrl.searchParams.has(key)) return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);
    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized', state: 'unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (hasForbiddenQuery(request)) {
      return NextResponse.json(
        {
          error:
            'Read-only projection does not accept actuation or path parameters',
          state: 'error',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // A cold serverless instance has nothing cached. Measure once inline so
    // the first response carries live sources instead of an all-unknown shell.
    // Bounded: clients abort after 3s, so a cold read that cannot finish in
    // time answers with the honest syncing projection and the next poll lands
    // on the finished measurement.
    if (!hasCachedConfiguredShippingState()) {
      const measured = await measureWithin(INLINE_REFRESH_WAIT_MS);
      // Outlasted the inline wait: keep the coalesced measurement alive past
      // the response so the next poll reads the measured projection instead of
      // the serverless instance freezing it mid-flight.
      if (!measured) keepMeasuring();
      return NextResponse.json(
        measured ?? readCachedConfiguredShippingState(),
        { headers: NO_STORE_HEADERS }
      );
    }

    const projection = readCachedConfiguredShippingState();

    // Local-first (JOV-8961 / Mac daily-driver): a warm instance always paints
    // the last-known projection immediately. Reconciliation runs after the
    // response. Waiting on Linear/GitHub here held the Mac Shipping UI for
    // up to INLINE_REFRESH_WAIT_MS on every poll past the freshness window
    // (observed 2026-10-25: ages 50-161s while Home stayed live).
    // Cold instances still measure inline above; publisher coalescing keeps
    // background work to one read per instance per window.
    keepMeasuring();

    return NextResponse.json(projection, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[hud/shipping-state] Failed to publish projection', error);
    await captureError('HUD shipping-state projection failed', error, {
      route: '/api/hud/shipping-state',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Unavailable', state: 'unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
