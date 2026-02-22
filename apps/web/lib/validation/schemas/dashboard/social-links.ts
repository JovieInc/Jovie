/**
 * Social Links Validation Schemas
 *
 * Schemas for /api/dashboard/social-links routes.
 */

import { z } from 'zod';

/**
 * Link state enum values for social links.
 */
export const linkStateValues = ['active', 'suggested', 'rejected'] as const;

/**
 * Link state validation schema.
 */
export const linkStateSchema = z.enum(linkStateValues);

/**
 * Inferred TypeScript type for link states.
 */
export type LinkState = z.infer<typeof linkStateSchema>;

/**
 * Source type enum values for social links.
 */
export const sourceTypeValues = ['manual', 'admin', 'ingested'] as const;

/**
 * Source type validation schema.
 */
export const sourceTypeSchema = z.enum(sourceTypeValues);

/**
 * Inferred TypeScript type for source types.
 */
export type SourceType = z.infer<typeof sourceTypeSchema>;

/**
 * Link evidence validation schema.
 * Tracks provenance and signals for link verification.
 */
export const linkEvidenceSchema = z
  .object({
    sources: z.array(z.string()).optional(),
    signals: z.array(z.string()).optional(),
  })
  .optional();

/**
 * Inferred TypeScript type for link evidence.
 */
export type LinkEvidence = z.infer<typeof linkEvidenceSchema>;

/**
 * Individual social link validation schema for PUT requests.
 *
 * Note: Platform validation uses external isValidSocialPlatform function
 * which must be applied in the consuming route via refine.
 */
export const socialLinkInputSchema = z.object({
  /** Platform identifier (validated externally) */
  platform: z.string().min(1),
  /** Platform category type */
  platformType: z.string().min(1).optional(),
  /** Link URL (max 2048 chars) */
  url: z.string().min(1).max(2048),
  /** Display order */
  sortOrder: z.number().int().min(0).optional(),
  /** Active status flag */
  isActive: z.boolean().optional(),
  /** Custom display text */
  displayText: z.string().max(256).optional(),
  /** Link state: active, suggested, or rejected */
  state: linkStateSchema.optional(),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1).optional(),
  /** Source platform identifier */
  sourcePlatform: z.string().max(128).optional(),
  /** How the link was added */
  sourceType: sourceTypeSchema.optional(),
  /** Provenance evidence */
  evidence: linkEvidenceSchema,
  verificationStatus: z.enum(['unverified', 'pending', 'verified']).optional(),
  verificationToken: z.string().max(256).optional(),
});

/**
 * Inferred TypeScript type for social link input.
 */
export type SocialLinkInput = z.infer<typeof socialLinkInputSchema>;

/**
 * Update social links validation schema.
 * Used for PUT /api/dashboard/social-links requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const updateSocialLinksSchema = z.object({
  /** Creator profile ID (required) */
  profileId: z.string().min(1),
  /** Optional idempotency key for deduplication */
  idempotencyKey: z.string().max(128).optional(),
  /** Expected version for optimistic locking (0 = empty state) */
  expectedVersion: z.number().int().min(0).optional(),
  /** Array of links to save (max 100) */
  links: z.array(socialLinkInputSchema).max(100).optional(),
});

/**
 * Inferred TypeScript type for update social links payload.
 */
export type UpdateSocialLinksPayload = z.infer<typeof updateSocialLinksSchema>;

/**
 * Link action enum values.
 */
export const linkActionValues = ['accept', 'dismiss'] as const;

/**
 * Link action validation schema.
 */
export const linkActionSchema = z.enum(linkActionValues);

/**
 * Inferred TypeScript type for link actions.
 */
export type LinkAction = z.infer<typeof linkActionSchema>;

/**
 * Update link state validation schema.
 * Used for PATCH /api/dashboard/social-links requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const updateLinkStateSchema = z.object({
  /** Creator profile ID */
  profileId: z.string().min(1),
  /** Link ID to update */
  linkId: z.string().min(1),
  /** Action to perform: accept or dismiss */
  action: linkActionSchema,
  /** Expected version for optimistic locking (0 = empty state) */
  expectedVersion: z.number().int().min(0).optional(),
});

/**
 * Inferred TypeScript type for update link state payload.
 */
export type UpdateLinkStatePayload = z.infer<typeof updateLinkStateSchema>;
