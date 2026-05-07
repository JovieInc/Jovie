import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import {
  dispatchHermesWorker,
  HermesDispatchConfigurationError,
  HermesDispatchGitHubError,
} from '@/lib/hermes/dispatch';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function POST(request: NextRequest) {
  try {
    const kioskToken = request.nextUrl.searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    if (auth.mode !== 'admin') {
      return NextResponse.json(
        { error: 'HUD kiosk mode cannot dispatch AI ops workers' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json()) as unknown;
    const result = await dispatchHermesWorker(body);

    return NextResponse.json(
      { dispatched: true, ...result },
      { status: 202, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid Hermes dispatch request', issues: error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (error instanceof HermesDispatchConfigurationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    if (error instanceof HermesDispatchGitHubError) {
      logger.error('[HUD AI Ops] GitHub dispatch failed', {
        status: error.status,
        message: error.message,
      });
      return NextResponse.json(
        { error: 'Hermes worker dispatch failed' },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    await captureError('HUD AI ops dispatch route failed', error, {
      route: '/api/hud/ai-ops/dispatch',
    });
    logger.error('Error in HUD AI ops dispatch API:', error);
    return NextResponse.json(
      { error: 'Failed to dispatch Hermes worker' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
