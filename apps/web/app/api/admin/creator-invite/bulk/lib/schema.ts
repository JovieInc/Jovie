/**
 * Bulk Invite Schema
 *
 * Zod validation schema for bulk invite requests.
 */

import { z } from 'zod';
import {
  DEFAULT_FIT_SCORE_THRESHOLD,
  DEFAULT_LIMIT,
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_MAX_PER_HOUR,
  DEFAULT_MIN_DELAY_MS,
  MAX_BATCH_LIMIT,
} from './constants';

export const bulkInviteSchema = z
  .object({
    /**
     * Array of profile IDs to send invites to.
     * If not provided, will auto-select based on fitScoreThreshold.
     */
    creatorProfileIds: z.array(z.string().uuid()).optional(),

    /**
     * Minimum fit score for auto-selection (0-100).
     * Only used when creatorProfileIds is not provided.
     */
    fitScoreThreshold: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .default(DEFAULT_FIT_SCORE_THRESHOLD),

    /**
     * Maximum number of invites to send in this batch.
     */
    limit: z
      .number()
      .min(1)
      .max(MAX_BATCH_LIMIT)
      .optional()
      .default(DEFAULT_LIMIT),

    /**
     * Minimum delay between emails in milliseconds.
     * Actual delay will be randomized between minDelayMs and maxDelayMs.
     */
    minDelayMs: z
      .number()
      .min(1000)
      .max(300000)
      .optional()
      .default(DEFAULT_MIN_DELAY_MS),

    /**
     * Maximum delay between emails in milliseconds.
     * Actual delay will be randomized between minDelayMs and maxDelayMs.
     */
    maxDelayMs: z
      .number()
      .min(1000)
      .max(600000)
      .optional()
      .default(DEFAULT_MAX_DELAY_MS),

    /**
     * Maximum emails per hour (rate limiting).
     * Default is 30/hour to stay well under spam thresholds.
     */
    maxPerHour: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(DEFAULT_MAX_PER_HOUR),

    /**
     * If true, only return what would be sent without actually sending.
     */
    dryRun: z.boolean().optional().default(false),
  })
  .refine(data => data.minDelayMs <= data.maxDelayMs, {
    message: 'minDelayMs must be <= maxDelayMs',
    path: ['minDelayMs'],
  });

export type BulkInviteInput = z.infer<typeof bulkInviteSchema>;
