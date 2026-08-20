import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeHud } from '@/lib/auth/hud';
import { captureError } from '@/lib/error-tracking';
import {
  EMPTY_WHAT_SHIPPED_RESPONSE,
  readWhatShippedFromDisk,
  UNAVAILABLE_WHAT_SHIPPED_RESPONSE,
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
    let diskPayload = EMPTY_WHAT_SHIPPED_RESPONSE;
    try {
      diskPayload = await readWhatShippedFromDisk();
    } catch (error) {
      logger.error('[ops/what-shipped] Disk read failed', error);
      diskPayload = {
        ...UNAVAILABLE_WHAT_SHIPPED_RESPONSE,
        errorMessage:
          error instanceof Error ? error.message : 'Disk read failed',
      };
    }

    if (diskPayload.available) {
      return NextResponse.json(diskPayload, { headers: NO_STORE_HEADERS });
    }

    const githubPayload = await readWhatShippedFromGitHub();
    if (githubPayload.available) {
      return NextResponse.json(githubPayload, { headers: NO_STORE_HEADERS });
    }

    const payload =
      diskPayload.observation === 'unavailable' ||
      githubPayload.observation === 'unavailable'
        ? {
            ...UNAVAILABLE_WHAT_SHIPPED_RESPONSE,
            errorMessage:
              (diskPayload.observation === 'unavailable'
                ? diskPayload.errorMessage
                : null) ??
              (githubPayload.observation === 'unavailable'
                ? githubPayload.errorMessage
                : null) ??
              UNAVAILABLE_WHAT_SHIPPED_RESPONSE.errorMessage,
          }
        : EMPTY_WHAT_SHIPPED_RESPONSE;

    return NextResponse.json(payload, {
      status: payload.observation === 'unavailable' ? 503 : 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[ops/what-shipped] Failed to read what shipped feed', error);
    await captureError('What shipped feed read failed', error, {
      route: '/api/ops/what-shipped',
      method: 'GET',
    });

    return NextResponse.json(UNAVAILABLE_WHAT_SHIPPED_RESPONSE, {
      status: 503,
      headers: NO_STORE_HEADERS,
    });
  }
}
