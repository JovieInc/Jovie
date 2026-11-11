import 'server-only';
import {
  type OnboardingWant,
  WANT_NOT_AVAILABLE,
} from '@/lib/chat/tools/onboarding-signals';
import { captureError } from '@/lib/error-tracking';
import { createFeedbackItem } from '@/lib/feedback';
import { ONBOARDING_WANT_FEEDBACK_SOURCE } from '@/lib/feedback-classification';

/** Longest want text stored on a build request row. */
export const ONBOARDING_WANT_MAX_LENGTH = 500;

/**
 * Turns a /start visitor's unmet want into one closed-loop build request
 * ("build and certify what qualified people ask for"). Wants that match an
 * available capability stay a signal only and write nothing. Never throws:
 * a failed write must not fail the chat turn. No outbound: the source is
 * outside the customer-voice set, so nobody is texted or pinged.
 */
export async function captureOnboardingWant(
  sessionId: string,
  want: OnboardingWant | undefined
): Promise<void> {
  if (!want || want.capability !== WANT_NOT_AVAILABLE) return;
  const message = want.text.trim().slice(0, ONBOARDING_WANT_MAX_LENGTH);
  if (!message) return;
  try {
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
