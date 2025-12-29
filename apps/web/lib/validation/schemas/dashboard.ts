import { Buffer } from 'buffer';
import { z } from 'zod';
import { httpUrlSchema, uuidSchema } from './base';

/**
 * Dashboard validation schemas for /api/dashboard/* routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in dashboard API endpoints.
 *
 * @see /api/dashboard/profile
 * @see /api/dashboard/social-links
 * @see /api/dashboard/audience/members
 * @see /api/dashboard/audience/subscribers
 * @see /api/dashboard/activity/recent
 */

// =============================================================================
// Profile Schemas
// =============================================================================

/**
 * Profile settings validation schema.
 * Validates dashboard settings with strict mode and payload size limit.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const settingsSchema = z
  .object({
    hide_branding: z.boolean().optional(),
    marketing_emails: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (size > 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Settings payload is too large',
      });
    }
  });

/**
 * Inferred TypeScript type for profile settings.
 */
export type ProfileSettings = z.infer<typeof settingsSchema>;

/**
 * Theme preference validation schema.
 * Supports both 'preference' and 'mode' keys for backwards compatibility.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const themeSchema = z
  .union([
    z
      .object({
        preference: z.enum(['light', 'dark', 'system']),
      })
      .strict(),
    z
      .object({
        mode: z.enum(['light', 'dark', 'system']),
      })
      .strict(),
  ])
  .transform(value => {
    const preference = 'preference' in value ? value.preference : value.mode;
    return { preference, mode: preference };
  });

/**
 * Inferred TypeScript type for theme preferences.
 */
export type ThemePreference = z.infer<typeof themeSchema>;

/**
 * Venmo handle validation schema.
 * Strips leading '@' symbol and validates format.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const venmoHandleSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
    return withoutAt;
  },
  z
    .string()
    .min(1)
    .max(30)
    // Venmo allows letters, numbers, underscores, and hyphens
    .regex(/^[A-Za-z0-9_-]{1,30}$/)
    .transform(handle => `@${handle}`)
);

/**
 * Inferred TypeScript type for Venmo handle (normalized with @).
 */
export type VenmoHandle = z.infer<typeof venmoHandleSchema>;

/**
 * Creator type enum values.
 */
export const creatorTypeValues = [
  'artist',
  'podcaster',
  'influencer',
  'creator',
] as const;

/**
 * Creator type validation schema.
 */
export const creatorTypeSchema = z.enum(creatorTypeValues);

/**
 * Inferred TypeScript type for creator types.
 */
export type CreatorType = z.infer<typeof creatorTypeSchema>;

/**
 * Profile update validation schema.
 * Used for PUT /api/dashboard/profile requests.
 *
 * Note: Username validation uses external validateUsername function which
 * must be applied in the consuming route due to the superRefine pattern.
 * This schema is exported without username validation for reusability.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const profileUpdateSchema = z
  .object({
    /** Username (3-30 chars, validated externally) */
    username: z.string().trim().min(3).max(30).optional(),
    /** Display name (1-60 chars) */
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name cannot be empty')
      .max(60, 'Display name must be 60 characters or fewer')
      .optional(),
    /** Profile bio (max 512 chars) */
    bio: z
      .string()
      .trim()
      .max(512, 'Bio must be 512 characters or fewer')
      .optional(),
    /** Creator category type */
    creatorType: creatorTypeSchema.optional(),
    /** Avatar image URL */
    avatarUrl: httpUrlSchema.optional(),
    /** Spotify profile URL */
    spotifyUrl: httpUrlSchema.optional(),
    /** Apple Music profile URL */
    appleMusicUrl: httpUrlSchema.optional(),
    /** YouTube channel URL */
    youtubeUrl: httpUrlSchema.optional(),
    /** Profile visibility flag */
    isPublic: z.boolean().optional(),
    /** Marketing opt-out flag */
    marketingOptOut: z.boolean().optional(),
    /** Dashboard settings */
    settings: settingsSchema.optional(),
    /** Theme preferences */
    theme: themeSchema.optional(),
    /** Venmo handle for tips */
    venmo_handle: venmoHandleSchema.optional(),
  })
  .strict();

/**
 * Inferred TypeScript type for profile update payloads.
 */
export type ProfileUpdatePayload = z.infer<typeof profileUpdateSchema>;

// =============================================================================
// Social Links Schemas
// =============================================================================

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
  /** Expected version for optimistic locking */
  expectedVersion: z.number().int().min(1).optional(),
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
  /** Expected version for optimistic locking */
  expectedVersion: z.number().int().min(1).optional(),
});

/**
 * Inferred TypeScript type for update link state payload.
 */
export type UpdateLinkStatePayload = z.infer<typeof updateLinkStateSchema>;

// =============================================================================
// Audience Members Schemas
// =============================================================================

/**
 * Audience member sort column values.
 */
export const memberSortValues = [
  'lastSeen',
  'visits',
  'intent',
  'type',
  'engagement',
  'createdAt',
] as const;

/**
 * Audience member sort column validation schema.
 */
export const memberSortSchema = z.enum(memberSortValues);

/**
 * Inferred TypeScript type for member sort columns.
 */
export type MemberSort = z.infer<typeof memberSortSchema>;

/**
 * Sort direction enum values.
 */
export const sortDirectionValues = ['asc', 'desc'] as const;

/**
 * Sort direction validation schema.
 */
export const sortDirectionSchema = z.enum(sortDirectionValues);

/**
 * Inferred TypeScript type for sort directions.
 */
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * Audience members query validation schema.
 * Used for GET /api/dashboard/audience/members requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const membersQuerySchema = z.object({
  /** Creator profile ID (UUID format) */
  profileId: uuidSchema,
  /** Sort column */
  sort: memberSortSchema.default('lastSeen'),
  /** Sort direction */
  direction: sortDirectionSchema.default('desc'),
  /** Page number (1-indexed) */
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  /** Items per page (1-100) */
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
});

/**
 * Inferred TypeScript type for members query parameters.
 */
export type MembersQueryParams = z.infer<typeof membersQuerySchema>;

// =============================================================================
// Subscribers Schemas
// =============================================================================

/**
 * Subscriber sort column values.
 */
export const subscriberSortValues = [
  'email',
  'phone',
  'country',
  'createdAt',
] as const;

/**
 * Subscriber sort column validation schema.
 */
export const subscriberSortSchema = z.enum(subscriberSortValues);

/**
 * Inferred TypeScript type for subscriber sort columns.
 */
export type SubscriberSort = z.infer<typeof subscriberSortSchema>;

/**
 * Subscribers query validation schema.
 * Used for GET /api/dashboard/audience/subscribers requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const subscribersQuerySchema = z.object({
  /** Creator profile ID (UUID format) */
  profileId: uuidSchema,
  /** Sort column */
  sort: subscriberSortSchema.default('createdAt'),
  /** Sort direction */
  direction: sortDirectionSchema.default('desc'),
  /** Page number (1-indexed) */
  page: z.preprocess(val => Number(val ?? 1), z.number().int().min(1)),
  /** Items per page (1-100) */
  pageSize: z.preprocess(
    val => Number(val ?? 10),
    z.number().int().min(1).max(100)
  ),
});

/**
 * Inferred TypeScript type for subscribers query parameters.
 */
export type SubscribersQueryParams = z.infer<typeof subscribersQuerySchema>;

// =============================================================================
// Recent Activity Schemas
// =============================================================================

/**
 * Activity time range enum values.
 */
export const activityRangeValues = ['7d', '30d', '90d'] as const;

/**
 * Activity time range validation schema.
 */
export const activityRangeSchema = z.enum(activityRangeValues);

/**
 * Inferred TypeScript type for activity ranges.
 */
export type ActivityRange = z.infer<typeof activityRangeSchema>;

/**
 * Recent activity query validation schema.
 * Used for GET /api/dashboard/activity/recent requests.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const recentActivityQuerySchema = z.object({
  /** Creator profile ID (UUID format) */
  profileId: uuidSchema,
  /** Maximum number of activities to return (1-20) */
  limit: z.preprocess(val => Number(val ?? 5), z.number().int().min(1).max(20)),
  /** Time range filter */
  range: activityRangeSchema.optional().default('7d'),
});

/**
 * Inferred TypeScript type for recent activity query parameters.
 */
export type RecentActivityQueryParams = z.infer<
  typeof recentActivityQuerySchema
>;
