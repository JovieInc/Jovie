import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getHudEnvExceptions } from '@/lib/hud/env-exceptions.server';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const payload = getHudEnvExceptions();
    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/env-exceptions] Failed to load env exceptions',
      error
    );
    await captureError('HUD env exceptions failed', error, {
      route: '/api/admin/hud/env-exceptions',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load env exceptions' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
