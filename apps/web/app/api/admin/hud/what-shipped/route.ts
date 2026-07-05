import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { getHudWhatShipped } from '@/lib/hud/shipper-state';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const payload = getHudWhatShipped();
    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error('[api/admin/hud/what-shipped] Failed to load payload', error);
    await captureError('HUD what-shipped failed', error, {
      route: '/api/admin/hud/what-shipped',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load what shipped' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
