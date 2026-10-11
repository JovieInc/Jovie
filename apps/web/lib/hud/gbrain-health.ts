import 'server-only';

import type { HudGbrainHealth } from '@/types/hud';

const GBRAIN_HEALTH_TIMEOUT_MS = 2000;

/**
 * Reads the read-only gbrain health door. Returns undefined when unconfigured
 * so the HUD keeps its honest "No Signal" pill; never throws into the HUD.
 */
export async function getGbrainHealth(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<HudGbrainHealth | undefined> {
  if (!url) return undefined;
  const checkedAtIso = new Date().toISOString();
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(GBRAIN_HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) return { status: 'down', version: null, checkedAtIso };
    const body = (await response.json()) as {
      status?: unknown;
      version?: unknown;
    };
    return {
      status: body.status === 'ok' ? 'ok' : 'down',
      version: typeof body.version === 'string' ? body.version : null,
      checkedAtIso,
    };
  } catch {
    // Timeout or network failure: the door did not answer, so gbrain is down to us.
    return { status: 'down', version: null, checkedAtIso };
  }
}
