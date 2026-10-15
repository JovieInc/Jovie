import { z } from 'zod';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { commerceDecisionSourceSchema } from './commerce-decision';

export const AGENT_HANDOFF_DISCOVERY_PATH = '/api/acquisition/agent-handoff';
export const AGENT_INTENT_QUERY = 'agent_intent';
export const AGENT_INTENT_TTL_MS = 60 * 60_000;

// Use the matrix owner's redacted evidence-label contract for both revisions.
const revision = commerceDecisionSourceSchema.shape.matrixRevision;
export const agentIntentSchema = z
  .object({
    id: z.string().uuid(),
    expiresAt: z.number().int().positive(),
    offer: z.literal(ARTIST_VISIBILITY_OFFER_CONTRACT_ID),
    channel: z.literal('agent-handoff'),
    rail: z.literal('ordinary-web-checkout'),
    decisionRevision: revision,
    matrixRevision: revision,
  })
  .strict();

/** Attribution only. No credential, identity, access grant or payment authority. */
export type AgentIntent = z.infer<typeof agentIntentSchema>;
