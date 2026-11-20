import { linkOnboardingSessionReplaysToUser } from '@/lib/analytics/signup-replay.server';
import { captureError } from '@/lib/error-tracking';
import { isWaitlistGateEnabled } from '@/lib/waitlist/settings';

const CLAIM_ERROR_CONTEXT = {
  route: '/api/onboarding/claim',
  method: 'POST',
} as const;

/** Best effort: tie this visitor's session replays to the new account. */
export async function linkClaimReplaysBestEffort(
  sessionId: string,
  userId: string
): Promise<void> {
  await linkOnboardingSessionReplaysToUser(sessionId, userId).catch(error =>
    captureError('Onboarding replay link failed', error, CLAIM_ERROR_CONTEXT)
  );
}

/** Waitlist gate lookup for the claim; fails closed (gated) on lookup errors. */
export async function isClaimAccessControlled(): Promise<boolean> {
  return isWaitlistGateEnabled().catch(async error => {
    await captureError(
      'Onboarding claim gate lookup failed',
      error,
      CLAIM_ERROR_CONTEXT
    );
    return true;
  });
}
