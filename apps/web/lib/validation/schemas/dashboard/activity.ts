/**
 * Activity Validation Schemas
 *
 * Schemas for /api/dashboard/activity/* routes.
 */

import { z } from 'zod';
import { uuidSchema } from '../base';

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
