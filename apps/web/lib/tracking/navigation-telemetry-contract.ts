import { APP_ROUTES } from '@/constants/routes';

/** Privacy-safe shell navigation telemetry contract (JOV-4377). */
export const NAVIGATION_TELEMETRY_SCHEMA_VERSION = 1 as const;
export const NAVIGATION_TELEMETRY_ENDPOINT =
  '/api/analytics/navigation' as const;
export const NAVIGATION_TELEMETRY_OWNER = '@itstimwhite' as const;
export const NAVIGATION_TELEMETRY_MAX_BATCH_SIZE = 8;

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
  'home',
  'presence',
  'links',
  'audience',
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

export const NAVIGATION_ITEM_DESTINATION_ROUTES = {
  home: 'inbox',
  presence: 'other_app',
  links: 'chat',
  audience: 'contacts',
  inbox: 'inbox',
  chat: 'chat',
  library: 'library',
  contacts: 'contacts',
  calendar: 'calendar',
  tasks: 'tasks',
  settings: 'settings',
} as const satisfies Partial<Record<NavigationItemId, NavigationRouteBucket>>;

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

/** Canonical customer IA only. Variants preserve before/after ontology evidence. */
export const NAVIGATION_VARIANTS = [
  'canonical_customer_ia_v1',
  'canonical_identity_work_v1',
] as const;
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

const NAVIGATION_LATENCY_BUCKET_DEFINITIONS = [
  { bucket: 'na', upperBoundMs: null },
  { bucket: 'le_100ms', upperBoundMs: 100 },
  { bucket: 'le_250ms', upperBoundMs: 250 },
  { bucket: 'le_500ms', upperBoundMs: 500 },
  { bucket: 'le_1s', upperBoundMs: 1000 },
  { bucket: 'le_2_5s', upperBoundMs: 2500 },
  { bucket: 'le_5s', upperBoundMs: 5000 },
  { bucket: 'le_10s', upperBoundMs: 10_000 },
  { bucket: 'gt_10s', upperBoundMs: 10_001 },
] as const satisfies ReadonlyArray<{
  bucket: NavigationLatencyBucket;
  upperBoundMs: number | null;
}>;

// The zod schemas that validate these payloads live in
// ./navigation-telemetry-schema, imported only by the server route. The client
// tracker needs just the constants and bucketing helpers below; keeping zod out
// of this module keeps it out of the signed-in shell's first-load chunk.
export type {
  NavigationTelemetryBatch,
  NavigationTelemetryPayload,
} from './navigation-telemetry-schema';

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
  if (isPathWithin(pathname, APP_ROUTES.PROFILES)) return 'other_app';
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

  const boundedBucket = NAVIGATION_LATENCY_BUCKET_DEFINITIONS.find(
    definition =>
      definition.bucket !== 'na' &&
      definition.bucket !== 'gt_10s' &&
      definition.upperBoundMs !== null &&
      durationMs <= definition.upperBoundMs
  );
  return boundedBucket?.bucket ?? 'gt_10s';
}

export function navigationLatencyBucketUpperBoundMs(
  bucket: NavigationLatencyBucket
): number | null {
  return (
    NAVIGATION_LATENCY_BUCKET_DEFINITIONS.find(
      definition => definition.bucket === bucket
    )?.upperBoundMs ?? null
  );
}
