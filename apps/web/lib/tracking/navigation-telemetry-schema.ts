import { z } from 'zod';
import {
  NAVIGATION_CONSENT_MODES,
  NAVIGATION_INPUT_METHODS,
  NAVIGATION_ITEM_DESTINATION_ROUTES,
  NAVIGATION_ITEM_IDS,
  NAVIGATION_LATENCY_BUCKETS,
  NAVIGATION_PLATFORMS,
  NAVIGATION_ROUTE_BUCKETS,
  NAVIGATION_TELEMETRY_EVENTS,
  NAVIGATION_TELEMETRY_MAX_BATCH_SIZE,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  NAVIGATION_VARIANTS,
} from './navigation-telemetry-contract';

/**
 * Validation for the navigation telemetry contract (JOV-4377). Split from the
 * contract so client trackers never evaluate zod; only the ingest route and
 * server analytics import this module.
 */

/** Opaque request key only. It is hashed before entering Redis key-space. */
const eventIdSchema = z
  .string()
  .min(16)
  .max(96)
  .regex(/^[a-zA-Z0-9:_-]+$/);

/**
 * Strict allowlist. Raw paths, query strings, titles, content, identity,
 * fingerprints, user agents, and IP addresses have no representable field.
 */
export const navigationTelemetryPayloadSchema = z
  .object({
    schema_version: z.literal(NAVIGATION_TELEMETRY_SCHEMA_VERSION),
    event_id: eventIdSchema,
    event: z.enum(NAVIGATION_TELEMETRY_EVENTS),
    item_id: z.enum(NAVIGATION_ITEM_IDS),
    source_route: z.enum(NAVIGATION_ROUTE_BUCKETS),
    destination_route: z.enum(NAVIGATION_ROUTE_BUCKETS),
    input_method: z.enum(NAVIGATION_INPUT_METHODS),
    platform: z.enum(NAVIGATION_PLATFORMS),
    nav_variant: z.enum(NAVIGATION_VARIANTS),
    consent_mode: z.enum(NAVIGATION_CONSENT_MODES),
    latency_bucket: z.enum(NAVIGATION_LATENCY_BUCKETS),
    success: z.boolean(),
  })
  .strict()
  .superRefine((payload, context) => {
    const invalid = (
      path: 'input_method' | 'latency_bucket' | 'success',
      message: string
    ) => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message,
      });
    };

    if (!payload.event_id.endsWith(`:${payload.event}`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['event_id'],
        message: 'Event id suffix must match the event type',
      });
    }

    if (payload.event === 'impression') {
      if (payload.input_method !== 'none') {
        invalid('input_method', 'Impressions cannot have an input method');
      }
      if (payload.latency_bucket !== 'na') {
        invalid('latency_bucket', 'Impressions cannot have latency');
      }
      if (!payload.success) {
        invalid('success', 'Impressions must be successful');
      }
      if (payload.source_route !== payload.destination_route) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['destination_route'],
          message: 'Impressions must remain within one route bucket',
        });
      }
      return;
    }

    if (payload.input_method === 'none') {
      invalid('input_method', `${payload.event} requires an input method`);
    }
    const expectedDestination =
      payload.item_id === 'unknown'
        ? undefined
        : NAVIGATION_ITEM_DESTINATION_ROUTES[payload.item_id];
    if (
      expectedDestination !== undefined &&
      expectedDestination !== payload.destination_route
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destination_route'],
        message: `${payload.event} destination must match its navigation item`,
      });
    }

    if (payload.event === 'activation') {
      if (payload.latency_bucket !== 'na') {
        invalid('latency_bucket', 'Activations cannot have latency');
      }
      if (payload.success) {
        invalid('success', 'Activations cannot be marked successful');
      }
      return;
    }

    if (payload.latency_bucket === 'na') {
      invalid('latency_bucket', `${payload.event} requires bounded latency`);
    }

    if (payload.event === 'destination_ready') {
      if (!payload.success) {
        invalid('success', 'Destination readiness must be successful');
      }
      return;
    }

    if (payload.success) {
      invalid('success', `${payload.event} cannot be marked successful`);
    }
  });

export type NavigationTelemetryPayload = z.infer<
  typeof navigationTelemetryPayloadSchema
>;

export const navigationTelemetryBatchSchema = z
  .object({
    schema_version: z.literal(NAVIGATION_TELEMETRY_SCHEMA_VERSION),
    events: z
      .array(navigationTelemetryPayloadSchema)
      .min(1)
      .max(NAVIGATION_TELEMETRY_MAX_BATCH_SIZE),
  })
  .strict();

export type NavigationTelemetryBatch = z.infer<
  typeof navigationTelemetryBatchSchema
>;
