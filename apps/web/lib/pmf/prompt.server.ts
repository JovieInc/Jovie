import 'server-only';

import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { isPmfSurveyEligibleForUser } from './store.server';

/**
 * The signed-in user the PMF prompt is due for, or null. Null when nobody is
 * signed in, the prompt is not due, or an admin is impersonating: an admin's
 * answer is not the artist's.
 */
export async function resolvePmfSurveyUserId(input: {
  readonly now: Date;
}): Promise<string | null> {
  const auth = await getCachedAuth();
  if (!auth.userId) return null;
  if (auth.actorUserId && auth.actorUserId !== auth.userId) return null;
  const eligible = await isPmfSurveyEligibleForUser({
    userId: auth.userId,
    now: input.now,
  });
  return eligible ? auth.userId : null;
}

/**
 * Whether the dashboard home renders the PMF survey card. A failed read
 * means no card: the home page never fails because of the survey.
 */
export async function shouldShowPmfSurvey(input: {
  readonly now: Date;
}): Promise<boolean> {
  try {
    return (await resolvePmfSurveyUserId(input)) !== null;
  } catch (error) {
    await captureError('pmf-survey: eligibility read failed', error, {
      route: 'lib/pmf/prompt.server',
    });
    return false;
  }
}
