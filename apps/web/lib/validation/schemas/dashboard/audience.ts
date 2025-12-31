/**
 * Audience Validation Schemas
 *
 * Schemas for /api/dashboard/audience/* routes.
 */

import { z } from 'zod';
import { uuidSchema } from '../base';

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
