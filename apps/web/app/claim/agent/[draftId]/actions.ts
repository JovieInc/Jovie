'use server';

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { agentClaimPath } from '@/lib/agent-acquisition/claim-handoff';
import { claimAgentDraft } from '@/lib/agent-acquisition/draft-claim.server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import {
  allowIfRateLimitBackendDegraded,
  claimTokenAccessLimiter,
} from '@/lib/rate-limit';
import { authHref } from './claim-states';

const DRAFT_ID = /^[0-9a-f-]{36}$/i;
const HANDOFF = /^[A-Za-z0-9_-]{43}$/;
const DIGEST = /^[A-Za-z0-9_-]{43}$/;

/**
 * Every redirect target is a server-built relative path: never a value
 * echoed from the request, so this action cannot be an open redirect.
 */
export async function claimAgentDraftAction(formData: FormData) {
  const draftId = String(formData.get('draftId') ?? '');
  const handoff = String(formData.get('h') ?? '');
  const reviewedDigest = String(formData.get('p') ?? '');
  if (!DRAFT_ID.test(draftId) || !HANDOFF.test(handoff)) {
    redirect(APP_ROUTES.START);
  }
  const claimPath = agentClaimPath(draftId, handoff);
  const { userId } = await getOptionalAuth();
  if (!userId) redirect(authHref(APP_ROUTES.SIGNUP, claimPath));

  const limit = allowIfRateLimitBackendDegraded(
    await claimTokenAccessLimiter.limit(`agent-claim:${userId}`),
    { route: '/claim/agent' }
  );
  if (!limit.success) redirect(`${claimPath}&e=retry_later`);

  let target: string;
  try {
    const result = DIGEST.test(reviewedDigest)
      ? await claimAgentDraft(draftId, handoff, userId, reviewedDigest)
      : ({ status: 'draft_changed' } as const);
    switch (result.status) {
      case 'claimed':
        target = APP_ROUTES.DASHBOARD;
        break;
      case 'existing_profile':
        // The existing direct-profile claim flow owns this artist's profile.
        target = `/${encodeURIComponent(result.handle)}/claim?next=auth`;
        break;
      case 'verification_required':
        // High-reach artists go through the existing verification path.
        target = `${APP_ROUTES.CLAIM_START}?spotify=${encodeURIComponent(result.spotifyId)}`;
        break;
      default:
        target = `${claimPath}&e=${result.status}`;
    }
  } catch (error) {
    await captureError('Agent draft claim failed', error, {
      route: '/claim/agent',
    });
    target = `${claimPath}&e=retry_later`;
  }
  redirect(target);
}
