import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { readWhatShippedFeed } from '@/lib/ops/what-shipped';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/ops/what-shipped
 *
 * Proxies the Hermes sidecar feed at ~/.hermes/state/what_shipped.json.
 * Admin-only; returns an empty feed when the file is unavailable.
 */
export async function GET(): Promise<Response> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const feed = await readWhatShippedFeed();
    return NextResponse.json(feed, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/ops/what-shipped] Failed to read what shipped feed',
      error
    );
    await captureError('What shipped feed read failed', error, {
      route: '/api/ops/what-shipped',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load what shipped feed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
