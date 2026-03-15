import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import { getHudMetrics } from '@/lib/hud/metrics';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: NextRequest) {
  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const metrics = await getHudMetrics(auth.mode);
    return NextResponse.json(metrics, { headers: NO_STORE_HEADERS });
  } catch (error) {
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
