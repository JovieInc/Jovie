import { z } from 'zod';
import type { AcquisitionFirstTouch } from '@/lib/db/schema/acquisition';

const field = z.string().trim().min(1).max(200);
// Operational, caller-supplied provenance. This is not marketing consent or
// verified attribution; the existing consent-scoped journey owns that boundary.
export const agentAcquisitionSchema = z
  .object({
    agent_source: field.nullish(),
    client: field.nullish(),
    installation_id: field.nullish(),
    referral_token: field.nullish(),
    session_or_run_id: field.nullish(),
    intent: field.nullish(),
    first_touch: z
      .object({
        source: field.optional(),
        medium: field.optional(),
        campaign: field.optional(),
        term: field.optional(),
        content: field.optional(),
        referrer: z.string().url().max(500).optional(),
        landingPath: z.string().max(500).startsWith('/').optional(),
        claimId: field.optional(),
        runId: field.optional(),
        candidateId: field.optional(),
        offerVersion: field.optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .default({ first_touch: {} });

export type AgentAcquisition = z.output<typeof agentAcquisitionSchema> & {
  first_touch: AcquisitionFirstTouch;
};

export const createAgentDraftSchema = z
  .object({
    artist_id: z.string().min(1).max(64),
    draft_token: z.string().min(1).max(8192),
  })
  .strict();

export const AGENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const draftCapabilitySchema = z
  .object({
    version: z.literal(1),
    draft_id: z.uuid(),
    artist_id: z.string().min(1).max(64),
    issued_at: z.number().int().nonnegative(),
    storefront: z
      .string()
      .regex(/^[a-z]{2}$/)
      .optional(),
    expires_at: z.number().int().positive(),
    acquisition: agentAcquisitionSchema,
  })
  .strict();

export type DraftCapability = z.output<typeof draftCapabilitySchema>;
