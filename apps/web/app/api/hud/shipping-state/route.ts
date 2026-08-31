import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { FORBIDDEN_QUERY_KEYS } from '@/lib/ovie/shipping-state';
import { publishConfiguredShippingState } from '@/lib/ovie/shipping-state/configured.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

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

    const projection = await publishConfiguredShippingState();

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
