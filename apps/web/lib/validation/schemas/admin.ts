import { z } from 'zod';
import { httpUrlSchema, uuidSchema } from './base';

/**
 * Admin validation schemas for /api/admin/*, /api/cron/*, and /api/waitlist/* routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in admin API endpoints.
 *
 * @see /api/admin/roles
 * @see /api/admin/creator-ingest
 * @see /api/admin/creator-ingest/rerun
 * @see /api/cron/waitlist-invites
 * @see /api/waitlist
 * @see /app/admin/waitlist/approve
 */

// =============================================================================
// Role Management Schemas
// =============================================================================

/**
 * Admin role literal type.
 * Currently only 'admin' role is supported.
 */
export const adminRoleLiteral = z.literal('admin');

/**
 * Inferred TypeScript type for admin role.
 */
export type AdminRole = z.infer<typeof adminRoleLiteral>;

/**
 * Grant role validation schema.
 * Used for POST /api/admin/roles requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const grantRoleSchema = z.object({
  /** Target user's Clerk ID */
  userId: z.string().min(1, 'User ID is required'),
  /** Role to grant (currently only 'admin' supported) */
  role: adminRoleLiteral,
});

/**
 * Inferred TypeScript type for grant role payload.
 */
export type GrantRolePayload = z.infer<typeof grantRoleSchema>;

/**
 * Revoke role validation schema.
 * Used for DELETE /api/admin/roles requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const revokeRoleSchema = z.object({
  /** Target user's Clerk ID */
  userId: z.string().min(1, 'User ID is required'),
  /** Role to revoke (currently only 'admin' supported) */
  role: adminRoleLiteral,
});

/**
 * Inferred TypeScript type for revoke role payload.
 */
export type RevokeRolePayload = z.infer<typeof revokeRoleSchema>;

// =============================================================================
// Creator Ingestion Schemas
// =============================================================================

/**
 * Creator ingest validation schema.
 * Used for POST /api/admin/creator-ingest requests.
 * Ingests a Linktree or Laylo profile by URL.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const creatorIngestSchema = z.object({
  /** Profile URL to ingest (Linktree or Laylo) */
  url: z.string().url(),
  /** Optional idempotency key to prevent duplicate ingestion on double-click */
  idempotencyKey: z.string().uuid().optional(),
});

/**
 * Inferred TypeScript type for creator ingest payload.
 */
export type CreatorIngestPayload = z.infer<typeof creatorIngestSchema>;

/**
 * Ingestion rerun validation schema.
 * Used for POST /api/admin/creator-ingest/rerun requests.
 * Triggers a re-ingestion of an existing creator profile.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const ingestionRerunSchema = z.object({
  /** Creator profile ID to re-ingest (UUID format) */
  profileId: uuidSchema,
});

/**
 * Inferred TypeScript type for ingestion rerun payload.
 */
export type IngestionRerunPayload = z.infer<typeof ingestionRerunSchema>;

// =============================================================================
// Waitlist Schemas
// =============================================================================

/**
 * Primary goal enum values for waitlist submissions.
 */
export const waitlistGoalValues = ['streams', 'merch', 'tickets'] as const;

/**
 * Primary goal validation schema.
 */
export const waitlistGoalSchema = z.enum(waitlistGoalValues);

/**
 * Inferred TypeScript type for waitlist goals.
 */
export type WaitlistGoal = z.infer<typeof waitlistGoalSchema>;

/**
 * Pricing plan enum values for waitlist submissions.
 */
export const waitlistPlanValues = [
  'free',
  'branding',
  'pro',
  'growth',
] as const;

/**
 * Pricing plan validation schema.
 */
export const waitlistPlanSchema = z.enum(waitlistPlanValues);

/**
 * Inferred TypeScript type for waitlist plans.
 */
export type WaitlistPlan = z.infer<typeof waitlistPlanSchema>;

/**
 * Waitlist request validation schema.
 * Used for POST /api/waitlist requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const waitlistRequestSchema = z.object({
  /** User's primary goal: streams, merch, or tickets */
  primaryGoal: waitlistGoalSchema,
  /** Primary social media profile URL */
  primarySocialUrl: httpUrlSchema,
  /** Optional Spotify profile URL */
  spotifyUrl: httpUrlSchema.optional().nullable(),
  /** Optional Spotify artist display name (from search selection) */
  spotifyArtistName: z.string().trim().max(200).optional().nullable(),
  /** How the user heard about us (max 280 chars) */
  heardAbout: z.string().trim().max(280).optional().nullable(),
  /** Selected pricing plan interest */
  selectedPlan: waitlistPlanSchema.optional().nullable(),
});

/**
 * Inferred TypeScript type for waitlist request payload.
 */
export type WaitlistRequestPayload = z.infer<typeof waitlistRequestSchema>;

/**
 * Waitlist approval validation schema.
 * Used for POST /app/admin/waitlist/approve requests.
 * Approves a waitlist entry and creates invite.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const waitlistApproveSchema = z.object({
  /** Waitlist entry ID to approve (UUID format) */
  entryId: uuidSchema,
});

/**
 * Inferred TypeScript type for waitlist approval payload.
 */
export type WaitlistApprovePayload = z.infer<typeof waitlistApproveSchema>;

// =============================================================================
// Cron Job Schemas
// =============================================================================

/**
 * Waitlist invite send window validation schema.
 * Used for POST /api/cron/waitlist-invites requests.
 * Controls the cron job behavior for sending waitlist invites.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const waitlistInviteSendWindowSchema = z.object({
  /** Whether to respect the Pacific timezone send window (default: true) */
  sendWindowEnabled: z.boolean().default(true),
  /** Maximum number of invites to send per cron run (1-100, default: 10) */
  maxPerRun: z.number().int().min(1).max(100).default(10),
  /** Maximum number of invites to send per hour (1-1000, default: 50) */
  maxPerHour: z.number().int().min(1).max(1000).default(50),
});

/**
 * Inferred TypeScript type for waitlist invite send window config.
 */
export type WaitlistInviteSendWindowConfig = z.infer<
  typeof waitlistInviteSendWindowSchema
>;
