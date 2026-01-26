/**
 * Pixel Tracking Validation Schemas
 *
 * Validates incoming pixel events from the JoviePixel client component.
 */

import { z } from 'zod';

/**
 * Pixel event type enum
 */
export const pixelEventTypeSchema = z.enum([
  'page_view',
  'link_click',
  'form_submit',
  'scroll_depth',
]);

export type PixelEventType = z.infer<typeof pixelEventTypeSchema>;

/**
 * Event data schema (flexible based on event type)
 */
export const pixelEventDataSchema = z
  .object({
    // Link click data
    linkId: z.string().optional(),
    linkUrl: z.string().optional(),
    linkTitle: z.string().max(500).optional(),

    // Form submit data
    formType: z.enum(['capture', 'contact', 'unknown']).optional(),

    // UTM parameters
    utm_source: z.string().max(200).optional(),
    utm_medium: z.string().max(200).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
  })
  .passthrough(); // Allow additional fields

export type PixelEventData = z.infer<typeof pixelEventDataSchema>;

/**
 * Main pixel event payload schema
 */
export const pixelEventPayloadSchema = z.object({
  profileId: z.string().uuid(),
  sessionId: z.string().min(1).max(100),
  eventType: pixelEventTypeSchema,
  eventData: pixelEventDataSchema.optional(),
  consent: z.boolean(),
  referrer: z.string().max(2000).optional(),
  pageUrl: z.string().max(2000).optional(),
});

export type PixelEventPayload = z.infer<typeof pixelEventPayloadSchema>;
