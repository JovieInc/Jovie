import { BASE_URL } from '@/constants/app';
import {
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  getPlanSignupHref,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import {
  AGENT_INTENT_QUERY,
  AGENT_INTENT_TTL_MS,
  agentIntentSchema,
} from './agent-intent';
import { projectCommerceDecisions } from './commerce-decision';
import {
  buildFirstTouch,
  sealFirstTouchEnvelope,
} from './first-touch-envelope';

/** Discovery selects only the known supported web rail; it cannot grant access. */
export async function buildAgentHandoffDiscovery(
  input: unknown,
  now = new Date()
) {
  const projection = projectCommerceDecisions(input, now);
  const decision = projection.matrix.find(
    row =>
      row.offer === ARTIST_VISIBILITY_OFFER_CONTRACT_ID &&
      row.channel === 'agent-handoff' &&
      row.rail === 'ordinary-web-checkout' &&
      row.merchantOfRecord === 'jovie' &&
      row.accessState === 'supported' &&
      row.evidence.some(
        item => item.kind === 'selected-rail' && item.status === 'green'
      )
  );
  const price = getPublicPriceClaim('pro');
  let handoffUrl: string | null = null;
  if (decision) {
    const url = new URL(getPlanSignupHref('pro'), BASE_URL);
    const envelope = buildFirstTouch({ url }, now.getTime());
    const intent = agentIntentSchema.safeParse({
      id: crypto.randomUUID(),
      expiresAt: now.getTime() + AGENT_INTENT_TTL_MS,
      offer: decision.offer,
      channel: decision.channel,
      rail: decision.rail,
      decisionRevision: decision.decisionRevision,
      matrixRevision: projection.matrixRevision,
    });
    if (intent.success) {
      const sealed = await sealFirstTouchEnvelope({
        ...envelope,
        agentIntent: intent.data,
      });
      if (sealed) {
        url.searchParams.set(AGENT_INTENT_QUERY, sealed);
        handoffUrl = url.toString();
      }
    }
  }
  return {
    offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    price: { amount: price.priceUsd, currency: 'USD', interval: 'month' },
    access: price.badge,
    handoffUrl,
    attributionOnly: true,
    humanConfirmationRequired: true,
    matrixRevision: projection.matrixRevision,
  };
}
