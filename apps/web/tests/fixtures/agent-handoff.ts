import type { CommerceDecisionSource } from '@/lib/acquisition/commerce-decision';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';

export function supportedAgentDecision(
  now = new Date()
): CommerceDecisionSource {
  const receipt = {
    status: 'green' as const,
    observedAt: now.toISOString(),
    maxAgeMs: 86_400_000,
  };
  return {
    matrixRevision: 'matrix-r7',
    decisions: [
      {
        offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'supported',
        merchantOfRecord: 'jovie',
        evidence: {
          selectedRail: receipt,
          jov6258Preflight: receipt,
          handoffCorrelation: receipt,
          paymentJourney: receipt,
          reversal: receipt,
        },
        decisionRevision: 'decision-r4',
        canary: { result: 'not-run', observedAt: null, maxAgeMs: 86_400_000 },
        nextReevaluationTrigger: 'commerce-evidence-updated',
      },
    ],
  };
}
