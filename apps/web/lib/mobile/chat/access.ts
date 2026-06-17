import 'server-only';

import { getSessionContext } from '@/lib/auth/session';
import { getAppFlagValue } from '@/lib/flags/server';

/**
 * Master environment switch. The native mobile chat runtime only serves turns on
 * environments that explicitly opt in via `MOBILE_CHAT_RUNTIME_ENABLED=true`.
 * Production stays off until launch is approved (see JOV-2550); alpha/staging opt in.
 */
export function isMobileChatRuntimeEnabled(): boolean {
  return process.env.MOBILE_CHAT_RUNTIME_ENABLED === 'true';
}

/**
 * Per-user alpha cohort check. Admins always pass; everyone else must be inside the
 * `ios_app_alpha_access` Statsig gate. Fetches the session, so prefer
 * {@link isMobileChatEnabledForUser} with a known `isAdmin` when the caller has
 * already resolved the session.
 */
export async function hasMobileChatAlphaAccess(
  clerkUserId: string
): Promise<boolean> {
  const session = await getSessionContext({
    clerkUserId,
    requireUser: true,
    requireProfile: false,
  });

  if (session.user.isAdmin) {
    return true;
  }

  return getAppFlagValue('IOS_APP_ALPHA_ACCESS', {
    userId: clerkUserId,
  });
}

/**
 * Whether native mobile chat is actually usable for this user in this environment:
 * the runtime must be enabled AND the user must be in the alpha cohort (or admin).
 *
 * This is the single source of truth behind both the `/api/mobile/v1/chat/turns`
 * gate and the `chatEnabled` capability returned by `/api/mobile/v1/me`, so the iOS
 * client never renders a Chat tab that would only 501/403.
 *
 * Pass `isAdmin` when the caller already resolved the session to avoid a refetch.
 */
export async function isMobileChatEnabledForUser(
  clerkUserId: string,
  options?: { readonly isAdmin?: boolean }
): Promise<boolean> {
  if (!isMobileChatRuntimeEnabled()) {
    return false;
  }

  if (options?.isAdmin) {
    return true;
  }

  return getAppFlagValue('IOS_APP_ALPHA_ACCESS', {
    userId: clerkUserId,
  });
}
