import type { CheckoutCorrelation } from '@/lib/stripe/checkout-correlation';
import type { FirstTouchEnvelope } from './first-touch-envelope';

/** Call only with a verified first-touch envelope. Never reads request fields. */
export function agentCheckoutCorrelation(
  envelope: FirstTouchEnvelope | null
): CheckoutCorrelation {
  if (!envelope) return {};
  const intent = envelope.agentIntent;
  return {
    acquisitionId: envelope.id,
    ...(intent
      ? {
          agentChannel: intent.channel,
          agentDecisionRevision: intent.decisionRevision,
          agentIntentId: intent.id,
          agentMatrixRevision: intent.matrixRevision,
          agentOffer: intent.offer,
          agentRail: intent.rail,
        }
      : {}),
  };
}
