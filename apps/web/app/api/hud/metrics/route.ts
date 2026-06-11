import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';
import { buildDegradedHudMetrics, getHudMetrics } from '@/lib/hud/metrics';
import { logger } from '@/lib/utils/logger';
import type { HudAccessMode } from '@/types/hud';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: NextRequest) {
  let accessMode: HudAccessMode = 'admin';

  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    accessMode = auth.mode;
    const metrics = await getHudMetrics(auth.mode);
    return NextResponse.json(metrics, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ServerFetchTimeoutError) {
      logger.warn('HUD metrics route timed out; returning degraded payload', {
        route: '/api/hud/metrics',
        context: error.context,
        timeoutMs: error.timeoutMs,
      });
      const metrics = buildDegradedHudMetrics(accessMode, {
        context: error.context,
        timeoutMs: error.timeoutMs,
      });
      return NextResponse.json(metrics, { headers: NO_STORE_HEADERS });
    }

    await captureError('HUD metrics route failed', error, {
      route: '/api/hud/metrics',
    });
    logger.error('Error in HUD metrics API:', error);
    return NextResponse.json(
      { error: 'Failed to load HUD metrics' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}