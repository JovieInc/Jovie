import { z } from 'zod';
import { safeHttpUrlSchema } from './base';

/**
 * Zod validation schemas for /api/wrap-link endpoints.
 * Reuses safeHttpUrlSchema for SSRF-safe URL validation.
 */

/** POST /api/wrap-link — create a new wrapped link */
export const wrapLinkPostSchema = z.object({
  url: safeHttpUrlSchema,
  customAlias: z
    .string()
    .min(3, 'Alias must be at least 3 characters')
    .max(20, 'Alias must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9-]+$/,
      'Alias may only contain letters, numbers, and hyphens'
    )
    .optional(),
  expiresInHours: z
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1 hour')
    .max(8760, 'Must be at most 8760 hours (1 year)')
    .optional(),
});

/** PUT /api/wrap-link — update an existing wrapped link */
export const wrapLinkPutSchema = z.object({
  shortId: z
    .string()
    .min(1, 'shortId is required')
    .max(50, 'shortId is too long'),
  titleAlias: z.string().max(200, 'Title alias is too long').optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

/** DELETE /api/wrap-link — delete a wrapped link */
export const wrapLinkDeleteSchema = z.object({
  shortId: z
    .string()
    .min(1, 'shortId is required')
    .max(50, 'shortId is too long'),
});
