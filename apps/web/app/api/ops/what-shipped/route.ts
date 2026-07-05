import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import {
  EMPTY_WHAT_SHIPPED_RESPONSE,
  readWhatShippedFromDisk,
} from '@/lib/hud/what-shipped';
import { readWhatShippedFromGitHub } from '@/lib/hud/what-shipped-github';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const kioskToken = new URL(request.url).searchParams.get('kiosk');
    const auth = await authorizeHud(kioskToken);

    if (!auth.ok) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Primary source: the sidecar-written local JSON cache (dev machine).
    // Fallback: recently merged PRs from GitHub with server-side humanized
    // titles, so the feed works wherever the web app is deployed.
    const diskPayload = await readWhatShippedFromDisk();
    const payload = diskPayload.available
      ? diskPayload
      : await readWhatShippedFromGitHub();

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[ops/what-shipped] Failed to read what shipped feed', error);
    await captureError('What shipped feed read failed', error, {
      route: '/api/ops/what-shipped',
      method: 'GET',
    });

    return NextResponse.json(EMPTY_WHAT_SHIPPED_RESPONSE, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  }
}
