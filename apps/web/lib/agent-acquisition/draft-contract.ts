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

const releaseField = z.string().trim().min(1).max(300);
const httpsUrl = z
  .url()
  .max(1000)
  .refine(value => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.port
    );
  }, 'A standard HTTPS URL is required');
const upc = z
  .string()
  .trim()
  .regex(/^\d{8,20}$/, 'UPC must contain 8 to 20 digits');

export const releaseMetadataSchema = z
  .object({
    title: releaseField.optional(),
    artist_name: releaseField.optional(),
    release_date: z.iso.date().optional(),
    artwork_url: httpsUrl.optional(),
    upc: upc.optional(),
    dsp_links: z.record(z.string().min(1).max(50), httpsUrl).optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'Release metadata is empty');

export const prepareReleaseLaunchSchema = z
  .object({
    draft_id: z.uuid(),
    draft_token: z.string().min(1).max(8192),
    release_url: httpsUrl.optional(),
    upc: upc.optional(),
    release_metadata: releaseMetadataSchema.optional(),
    goal: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    value => value.release_url || value.upc || value.release_metadata,
    'A release URL, UPC, or release metadata is required'
  );

export type PrepareReleaseLaunchInput = z.output<
  typeof prepareReleaseLaunchSchema
>;

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

export type InvalidInputField = { path: string; message: string };

/**
 * Self-correcting INVALID_INPUT body for calling LLMs. Only zod issue paths
 * and messages are returned, never input values, so a draft_token supplied in
 * a bad request cannot be echoed back.
 */
export function invalidInputError(error: z.ZodError) {
  const fields: InvalidInputField[] = error.issues.slice(0, 10).map(issue => ({
    path: issue.path.length ? issue.path.join('.') : '$',
    message: issue.message.slice(0, 200),
  }));
  return {
    status: 'error' as const,
    code: 'INVALID_INPUT' as const,
    next_action: 'correct_input' as const,
    retryable: false,
    message: `Invalid input. ${fields.map(f => `${f.path}: ${f.message}`).join('; ')}`,
    fields,
  };
}
