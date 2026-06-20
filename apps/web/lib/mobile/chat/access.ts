import 'server-only';

import { getAppFlagValue } from '@/lib/flags/server';

/**
 * Global runtime kill-switch for native mobile chat.
 * Returns true when MOBILE_CHAT_RUNTIME_ENABLED=true in the environment.
 */
export function isMobileChatRuntimeEnabled(): boolean {
  return process.env.MOBILE_CHAT_RUNTIME_ENABLED === 'true';
}

/**
 * Full per-request chat gate combining the env kill-switch with an optional
 * per-user Statsig gate (ios_app_alpha_access).
 *
 * Set MOBILE_CHAT_ALPHA_GATE_ENABLED=true in Doppler before the public App Store
 * launch so only users with the ios_app_alpha_access flag enabled can access
 * chat. Without it, any authenticated user gets chat when the runtime switch is
 * on — which is safe while the iOS app is internal-TestFlight only.
 *
 * To launch chat publicly, flip MOBILE_CHAT_ALPHA_GATE_ENABLED back to false
 * (or remove it) after the App Store launch decision (see JOV-3239, JOV-9550).
 */
export async function isMobileChatEnabled(
  userId: string | null
): Promise<boolean> {
  if (!isMobileChatRuntimeEnabled()) {
    return false;
  }

  if (process.env.MOBILE_CHAT_ALPHA_GATE_ENABLED === 'true') {
    return getAppFlagValue('IOS_APP_ALPHA_ACCESS', { userId });
  }

  return true;
}
