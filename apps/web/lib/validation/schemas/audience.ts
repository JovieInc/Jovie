import { z } from 'zod';
import {
  deviceTypeSchema,
  linkTypeSchema,
  metadataSchema,
  uuidSchema,
} from './base';

/**
 * Audience validation schemas for hot-path /api/audience/* routes.
 *
 * These schemas are pre-instantiated at module load time to avoid
 * per-request instantiation overhead in high-traffic audience tracking endpoints.
 *
 * @see /api/audience/click
 * @see /api/audience/visit
 */

/**
 * Click event validation schema.
 * Used for tracking link clicks and user interactions on creator profiles.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const clickSchema = z.object({
  /** Creator profile ID (required, UUID format) */
  profileId: uuidSchema,
  /** Optional link ID that was clicked */
  linkId: uuidSchema.optional(),
  /** Type of link clicked: listen, social, tip, or other */
  linkType: linkTypeSchema.default('other'),
  /** Optional custom label for the action */
  actionLabel: z.string().optional(),
  /** Optional platform identifier (e.g., 'spotify', 'instagram') */
  platform: z.string().optional(),
  /** Client IP address for geo-tracking */
  ipAddress: z.string().optional(),
  /** Browser user agent string */
  userAgent: z.string().optional(),
  /** HTTP referrer URL */
  referrer: z.string().optional(),
  /** Geo-located city */
  city: z.string().optional(),
  /** Geo-located country */
  country: z.string().optional(),
  /** Device type: mobile, desktop, tablet, or unknown */
  deviceType: deviceTypeSchema.optional(),
  /** Operating system */
  os: z.string().optional(),
  /** Browser name */
  browser: z.string().optional(),
  /** Additional metadata as key-value pairs */
  metadata: metadataSchema.optional(),
  /** Optional explicit audience member ID for attribution */
  audienceMemberId: uuidSchema.optional(),
  /** HMAC-SHA256 signed tracking token for request authentication */
  trackingToken: z.string().optional(),
});

/**
 * Inferred TypeScript type for click event payloads.
 */
export type ClickPayload = z.infer<typeof clickSchema>;

/**
 * Visit event validation schema.
 * Used for tracking page visits to creator profiles.
 *
 * Pre-instantiated to avoid per-request Zod schema construction overhead.
 */
export const visitSchema = z.object({
  /** Creator profile ID (required, UUID format) */
  profileId: uuidSchema,
  /** Client IP address for geo-tracking */
  ipAddress: z.string().optional(),
  /** Browser user agent string */
  userAgent: z.string().optional(),
  /** HTTP referrer URL */
  referrer: z.string().optional(),
  /** Geo-located city */
  geoCity: z.string().optional(),
  /** Geo-located country */
  geoCountry: z.string().optional(),
  /** Device type: mobile, desktop, tablet, or unknown */
  deviceType: deviceTypeSchema.optional(),
  /** HMAC-SHA256 signed tracking token for request authentication */
  trackingToken: z.string().optional(),
  /** UTM campaign tracking parameters from landing page URL */
  utmParams: z
    .object({
      source: z.string().max(200).optional(),
      medium: z.string().max(200).optional(),
      campaign: z.string().max(200).optional(),
      content: z.string().max(200).optional(),
      term: z.string().max(200).optional(),
    })
    .optional(),
});

/**
 * Inferred TypeScript type for visit event payloads.
 */
export type VisitPayload = z.infer<typeof visitSchema>;
