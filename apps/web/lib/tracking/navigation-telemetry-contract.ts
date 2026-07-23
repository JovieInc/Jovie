import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';

/** Privacy-safe shell navigation telemetry contract (JOV-4377). */
export const NAVIGATION_TELEMETRY_SCHEMA_VERSION = 1 as const;
export const NAVIGATION_TELEMETRY_ENDPOINT =
  '/api/analytics/navigation' as const;
export const NAVIGATION_TELEMETRY_OWNER = '@itstimwhite' as const;

export const NAVIGATION_TELEMETRY_EVENTS = [
  'impression',
  'activation',
  'destination_ready',
  'drop_off',
  'short_return',
] as const;
export type NavigationTelemetryEvent =
  (typeof NAVIGATION_TELEMETRY_EVENTS)[number];

export const NAVIGATION_ITEM_IDS = [
  'inbox',
  'chat',
  'library',
  'contacts',
  'calendar',
  'tasks',
  'settings',
  'unknown',
] as const;
export type NavigationItemId = (typeof NAVIGATION_ITEM_IDS)[number];

export const NAVIGATION_ROUTE_BUCKETS = [
  'inbox',
  'chat',
  'library',
  'contacts',
  'calendar',
  'tasks',
  'settings',
  'other_app',
] as const;
export type NavigationRouteBucket = (typeof NAVIGATION_ROUTE_BUCKETS)[number];

export const NAVIGATION_INPUT_METHODS = [
  'none',
  'pointer',
  'keyboard',
  'unknown',
] as const;
export type NavigationInputMethod = (typeof NAVIGATION_INPUT_METHODS)[number];

export const NAVIGATION_PLATFORMS = [
  'web_desktop',
  'web_mobile',
  'electron_desktop',
  'electron_mobile',
] as const;
export type NavigationPlatform = (typeof NAVIGATION_PLATFORMS)[number];

/** Canonical customer IA only. Retired shell experiments are not analytics dimensions. */
export const NAVIGATION_VARIANTS = ['canonical_customer_ia_v1'] as const;
export type NavigationVariant = (typeof NAVIGATION_VARIANTS)[number];

export const NAVIGATION_CONSENT_MODES = ['explicit', 'implicit'] as const;
export type NavigationConsentMode = (typeof NAVIGATION_CONSENT_MODES)[number];

export const NAVIGATION_LATENCY_BUCKETS = [
  'na',
  'le_100ms',
  'le_250ms',
  'le_500ms',
  'le_1s',
  'le_2_5s',
  'le_5s',
  'le_10s',
  'gt_10s',
] as const;
export type NavigationLatencyBucket =
  (typeof NAVIGATION_LATENCY_BUCKETS)[number];

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
  .strict();

export type NavigationTelemetryPayload = z.infer<
  typeof navigationTelemetryPayloadSchema
>;

function stripQueryAndFragment(value: string): string {
  const [withoutFragment] = value.split('#', 1);
  const [withoutQuery] = (withoutFragment ?? '').split('?', 1);
  return withoutQuery || APP_ROUTES.DASHBOARD;
}

function isPathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** Convert any route-like input into one of eight non-sensitive buckets. */
export function bucketNavigationRoute(value: string): NavigationRouteBucket {
  const pathname = stripQueryAndFragment(value);

  if (pathname === APP_ROUTES.DASHBOARD) return 'inbox';
  if (
    isPathWithin(pathname, APP_ROUTES.CHAT) ||
    isPathWithin(pathname, APP_ROUTES.CHATS)
  ) {
    return 'chat';
  }
  if (
    isPathWithin(pathname, APP_ROUTES.LIBRARY) ||
    isPathWithin(pathname, APP_ROUTES.RELEASES) ||
    isPathWithin(pathname, APP_ROUTES.LEGACY_DASHBOARD_LIBRARY) ||
    isPathWithin(pathname, APP_ROUTES.DASHBOARD_RELEASES)
  ) {
    return 'library';
  }
  if (
    isPathWithin(pathname, APP_ROUTES.CONTACTS) ||
    isPathWithin(pathname, APP_ROUTES.DASHBOARD_CONTACTS) ||
    isPathWithin(pathname, APP_ROUTES.DASHBOARD_AUDIENCE)
  ) {
    return 'contacts';
  }
  if (
    isPathWithin(pathname, APP_ROUTES.CALENDAR) ||
    isPathWithin(pathname, APP_ROUTES.DASHBOARD_TOUR_DATES)
  ) {
    return 'calendar';
  }
  if (
    isPathWithin(pathname, APP_ROUTES.TASKS) ||
    isPathWithin(pathname, APP_ROUTES.DASHBOARD_TASKS)
  ) {
    return 'tasks';
  }
  if (isPathWithin(pathname, APP_ROUTES.SETTINGS)) return 'settings';
  return 'other_app';
}

export function allowlistNavigationItemId(value: string): NavigationItemId {
  return (NAVIGATION_ITEM_IDS as readonly string[]).includes(value)
    ? (value as NavigationItemId)
    : 'unknown';
}

export function bucketNavigationLatency(
  durationMs: number
): NavigationLatencyBucket {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 'na';
  if (durationMs <= 100) return 'le_100ms';
  if (durationMs <= 250) return 'le_250ms';
  if (durationMs <= 500) return 'le_500ms';
  if (durationMs <= 1000) return 'le_1s';
  if (durationMs <= 2500) return 'le_2_5s';
  if (durationMs <= 5000) return 'le_5s';
  if (durationMs <= 10_000) return 'le_10s';
  return 'gt_10s';
}

export function navigationLatencyBucketUpperBoundMs(
  bucket: NavigationLatencyBucket
): number | null {
  const upperBounds: Record<NavigationLatencyBucket, number | null> = {
    na: null,
    le_100ms: 100,
    le_250ms: 250,
    le_500ms: 500,
    le_1s: 1000,
    le_2_5s: 2500,
    le_5s: 5000,
    le_10s: 10_000,
    gt_10s: 10_001,
  };
  return upperBounds[bucket];
}
