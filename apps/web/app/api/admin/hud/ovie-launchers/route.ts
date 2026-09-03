import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { loadOvieLauncherInventory } from '@/lib/hud/ovie-launchers.server';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const inventory = await loadOvieLauncherInventory();
    return NextResponse.json(inventory, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/ovie-launchers] Failed to load inventory',
      error
    );
    await captureError('HUD ovie-launchers fetch failed', error, {
      route: '/api/admin/hud/ovie-launchers',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load launcher inventory' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
