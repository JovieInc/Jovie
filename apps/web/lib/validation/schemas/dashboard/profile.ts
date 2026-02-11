/**
 * Profile Validation Schemas
 *
 * Schemas for /api/dashboard/profile routes.
 */

import { z } from 'zod';
import { isContentClean } from '../../content-filter';
import { httpUrlSchema, safeHttpUrlSchema } from '../base';

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
    exclude_self_from_analytics: z.boolean().optional(),
    require_double_opt_in: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const size = new TextEncoder().encode(JSON.stringify(value)).length;
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
    /** Display name (1-60 chars, content-filtered) */
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name cannot be empty')
      .max(60, 'Display name must be 60 characters or fewer')
      .refine(val => isContentClean(val), {
        message: 'This name contains language that is not allowed',
      })
      .optional(),
    /** Profile bio (max 512 chars) */
    bio: z
      .string()
      .trim()
      .max(512, 'Bio must be 512 characters or fewer')
      .optional(),
    /** Creator category type */
    creatorType: creatorTypeSchema.optional(),
    /** Avatar image URL (SSRF-safe, blocks private/internal addresses) */
    avatarUrl: safeHttpUrlSchema.optional(),
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
