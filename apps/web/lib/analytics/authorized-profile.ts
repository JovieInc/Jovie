import 'server-only';

import { getSessionContext } from '@/lib/auth/session';

const AUTHORIZED_PROFILE = Symbol('authorized-analytics-profile');

/** Immutable scope from an authenticated caller's user; never a profile input. */
export interface AuthorizedAnalyticsProfile {
  readonly userId: string;
  readonly profileId: string;
  readonly [AUTHORIZED_PROFILE]: true;
}

export async function resolveAuthorizedAnalyticsProfile(
  userId: string
): Promise<AuthorizedAnalyticsProfile> {
  // Callers already authenticated this app user (cookie or mobile bearer).
  // Resolving cookie auth here would reject existing explicit-user mobile reads.
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const { user, profile } = await getSessionContext({
    clerkUserId: userId,
    requireUser: true,
    requireProfile: true,
  });
  if (user.id !== userId || !profile || profile.userId !== userId) {
    throw new Error('Unauthorized');
  }

  return Object.freeze({
    userId,
    profileId: profile.id,
    [AUTHORIZED_PROFILE]: true as const,
  });
}

export function assertAuthorizedAnalyticsProfile(
  scope: AuthorizedAnalyticsProfile
): void {
  if (scope?.[AUTHORIZED_PROFILE] !== true) {
    throw new Error('Unauthorized');
  }
}
