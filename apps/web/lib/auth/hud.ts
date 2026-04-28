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
  const expectedToken = env.HUD_KIOSK_TOKEN;
  if (kioskToken && kioskToken === expectedToken) {
    return { ok: true, mode: 'kiosk' };
  }

  try {
    const entitlements = await getCurrentUserEntitlements();
    if (entitlements.isAuthenticated && entitlements.isAdmin) {
      return { ok: true, mode: 'admin' };
    }
  } catch {
    // Fail closed to the HUD fallback UI when Clerk context is unavailable.
  }

  if (!expectedToken) {
    return { ok: false, reason: 'not_configured' };
  }

  return { ok: false, reason: 'unauthorized' };
}
