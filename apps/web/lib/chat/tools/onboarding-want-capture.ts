import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import {
  type OnboardingWant,
  WANT_NOT_AVAILABLE,
} from '@/lib/chat/tools/onboarding-signals';
import { db } from '@/lib/db';
import { feedbackItems } from '@/lib/db/schema/feedback';
import { captureError } from '@/lib/error-tracking';
import { createFeedbackItem } from '@/lib/feedback';
import { ONBOARDING_WANT_FEEDBACK_SOURCE } from '@/lib/feedback-classification';

/** Longest want text stored on a build request row. */
export const ONBOARDING_WANT_MAX_LENGTH = 500;

/**
 * True when this session already logged the same want. Compares the stored
 * text case-insensitively rather than by the ASCII-only feedback
 * fingerprint, so two different non-Latin wants never collide.
 */
async function sessionAlreadyLoggedWant(
  sessionId: string,
  message: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: feedbackItems.id })
    .from(feedbackItems)
    .where(
      and(
        eq(feedbackItems.source, ONBOARDING_WANT_FEEDBACK_SOURCE),
        drizzleSql`lower(${feedbackItems.message}) = lower(${message})`,
        drizzleSql`${feedbackItems.context}->>'onboardingSessionId' = ${sessionId}`
      )
    )
    .limit(1);
  return Boolean(existing);
}

/**
 * Turns a /start visitor's unmet want into one closed-loop build request
 * ("build and certify what qualified people ask for"). Wants that match an
 * available capability stay a signal only and write nothing. Never throws:
 * a failed write must not fail the chat turn. No outbound: the source is
 * outside the customer-voice set, so nobody is texted or pinged. A want the
 * same session already logged is not logged again, so a restated want counts
 * once per visitor.
 */
export async function captureOnboardingWant(
  sessionId: string,
  want: OnboardingWant | undefined
): Promise<void> {
  if (!want || want.capability !== WANT_NOT_AVAILABLE) return;
  const message = want.text.trim().slice(0, ONBOARDING_WANT_MAX_LENGTH);
  if (!message) return;
  try {
    if (await sessionAlreadyLoggedWant(sessionId, message)) return;
    await createFeedbackItem({
      userId: null,
      source: ONBOARDING_WANT_FEEDBACK_SOURCE,
      message,
      context: {
        pathname: '/start',
        userAgent: null,
        timestampIso: new Date().toISOString(),
        onboardingSessionId: sessionId,
        matchedCapability: want.capability,
      },
    });
  } catch (error) {
    await captureError('Onboarding want build request not saved', error, {
      route: 'lib/chat/tools/onboarding-want-capture',
      onboardingSessionId: sessionId,
    }).catch(() => undefined);
  }
}
