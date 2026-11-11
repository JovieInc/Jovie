import * as Sentry from '@sentry/nextjs';
import { mustControlAnonymousAccess } from '@/lib/waitlist/public-signup-gate';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';

/**
 * Whether this onboarding chat turn runs under controlled golden-path
 * admission. One-flow onboarding (Tim, 2026-11-09): while signup is closed an
 * anonymous visitor always does, so the chat cannot promise instant access
 * that the claim would hold. Otherwise the DB waitlist gate decides.
 */
export async function isChatAccessControlled(
  isSignedIn: boolean,
  requestId: string
): Promise<boolean> {
  if (mustControlAnonymousAccess(isSignedIn)) return true;
  return isWaitlistGateEnabled().catch(error => {
    // Fail closed: a settings outage must never grant anonymous instant access.
    Sentry.captureException(error, {
      tags: { context: 'onboarding_waitlist_gate' },
      extra: { requestId },
    });
    return true;
  });
}
