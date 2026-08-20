import { NextResponse } from 'next/server';
import { env } from '@/lib/env-server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { requireAdminHudApiAccess } from '@/lib/hud/require-admin-hud-api';

export const runtime = 'nodejs';

/**
 * Logged-in admins can attach the kiosk token to /hud so a TV/bookmark
 * URL exists without copying Doppler by hand.
 */
export async function GET() {
  const denied = await requireAdminHudApiAccess();
  if (denied) return denied;

  const token = env.HUD_KIOSK_TOKEN?.trim() || null;
  return NextResponse.json({ token }, { headers: NO_STORE_HEADERS });
}
