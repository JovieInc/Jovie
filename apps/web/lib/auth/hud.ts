import 'server-only';

import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { env } from '@/lib/env-server';
import type { HudAccessMode } from '@/types/hud';

export type HudAuthResult =
  | { ok: true; mode: HudAccessMode }
  | { ok: false; reason: 'unauthorized' | 'not_configured' };

export async function authorizeHud(
  kioskToken: string | null
): Promise<HudAuthResult> {
  const entitlements = await getCurrentUserEntitlements();
  if (entitlements.isAuthenticated && entitlements.isAdmin) {
    return { ok: true, mode: 'admin' };
  }

  const expectedToken = env.HUD_KIOSK_TOKEN;
  if (!expectedToken) {
    return { ok: false, reason: 'not_configured' };
  }

  if (kioskToken && kioskToken === expectedToken) {
    return { ok: true, mode: 'kiosk' };
  }

  return { ok: false, reason: 'unauthorized' };
}
