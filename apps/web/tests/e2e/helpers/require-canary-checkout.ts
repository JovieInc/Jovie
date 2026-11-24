import type { CheckoutSessionResult } from './stripe-helpers';

export function requireCanaryCheckout(
  result: CheckoutSessionResult,
  recordBlocked: (reason: string) => void
): CheckoutSessionResult {
  if (result.alreadySubscribed || result.sessionId.startsWith('bps_')) {
    const reason =
      'JOV-9826: already-subscribed portal response; expected a fresh TEST checkout after persona cleanup (JOV-8805)';
    recordBlocked(reason);
    throw new Error(reason);
  }
  if (!result.sessionId.startsWith('cs_test_')) {
    const reason = 'JOV-9826: expected a Stripe TEST checkout session';
    recordBlocked(reason);
    throw new Error(reason);
  }
  return result;
}
