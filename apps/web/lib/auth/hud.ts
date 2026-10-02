import 'server-only';

import { getFreshAuth } from '@/lib/auth/cached';
import { env } from '@/lib/env-server';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';
import type { HudAccessMode } from '@/types/hud';

export type HudAuthResult =
  | { ok: true; mode: HudAccessMode }
  | { ok: false; reason: 'unauthorized' | 'not_configured' };

export async function authorizeHud(
  kioskToken: string | null,
  options?: { session?: 'cookie' | 'fresh'; privileged?: boolean }
): Promise<HudAuthResult> {
  const expectedToken = env.HUD_KIOSK_TOKEN;
  if (kioskToken && kioskToken === expectedToken) {
    // Token-only signage is independent machine authority. An interactive
    // signed-in browser still obeys its own optional privacy policy.
    try {
      const auth = await getFreshAuth();
      if (auth.userId && auth.sessionId)
        await assertOviePrivacyUnlocked({
          userId: auth.userId,
          sessionId: auth.sessionId,
        });
      return { ok: true, mode: 'kiosk' };
    } catch {
      return { ok: false, reason: 'unauthorized' };
    }
  }

  try {
    const denied = await requireOvieApiAccess({
      privileged: options?.privileged ?? false,
    });
    if (!denied) return { ok: true, mode: 'admin' };
  } catch {
    // Fail closed to the HUD fallback UI when Clerk context is unavailable.
  }

  if (!expectedToken) {
    return { ok: false, reason: 'not_configured' };
  }

  return { ok: false, reason: 'unauthorized' };
}
