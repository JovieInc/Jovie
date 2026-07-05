import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { getHudGithubRateLimits } from '@/lib/hud/github-rate-limits';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET(): Promise<Response> {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  try {
    const payload = await getHudGithubRateLimits();
    return NextResponse.json(payload, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    logger.error(
      '[api/admin/hud/github-rate-limits] Failed to load rate limits',
      error
    );
    await captureError('HUD GitHub rate limits failed', error, {
      route: '/api/admin/hud/github-rate-limits',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to load GitHub rate limits' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
