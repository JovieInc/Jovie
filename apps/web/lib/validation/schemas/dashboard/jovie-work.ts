/**
 * Jovie work feed validation schemas.
 *
 * Schemas for GET /api/dashboard/jovie-work/recent requests.
 */

import { z } from 'zod';
import { activityRangeSchema } from './activity';

export const recentJovieWorkQuerySchema = z.object({
  limit: z.preprocess(
    val => Number(val ?? 20),
    z.number().int().min(1).max(50)
  ),
  range: activityRangeSchema.optional().default('7d'),
});

export type RecentJovieWorkQueryParams = z.infer<
  typeof recentJovieWorkQuerySchema
>;
