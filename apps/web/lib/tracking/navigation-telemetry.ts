import { getConsentState, isAnalyticsAllowed } from '@/lib/tracking/consent';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  allowlistNavigationItemId,
  bucketNavigationLatency,
  bucketNavigationRoute,
  NAVIGATION_TELEMETRY_ENDPOINT,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  type NavigationConsentMode,
  type NavigationInputMethod,
  type NavigationItemId,
  type NavigationPlatform,
  type NavigationRouteBucket,
  type NavigationTelemetryEvent,
  type NavigationTelemetryPayload,
  type NavigationVariant,
} from '@/lib/tracking/navigation-telemetry-contract';

export const NAVIGATION_DROP_OFF_MS = 10_000;
export const NAVIGATION_SHORT_RETURN_MS = 15_000;

export interface NavigationTelemetryContext {
  readonly isElectron: boolean;
  readonly isMobile: boolean;
  readonly navVariant: NavigationVariant;
}

interface PendingNavigation {
  readonly navigationId: string;
  readonly itemId: NavigationItemId;
  readonly sourceRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly destinationRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly inputMethod: NavigationInputMethod;
  readonly context: NavigationTelemetryContext;
  readonly startedAt: number;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

interface ReadyNavigation {
  readonly sourceRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly destinationRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly readyAt: number;
}

interface RecentImpression {
  readonly recordedAt: number;
}

let pendingNavigation: PendingNavigation | null = null;
let lastReadyNavigation: ReadyNavigation | null = null;
const recentImpressions = new Map<string, RecentImpression>();

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function createOpaqueId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to a non-security identifier for older webviews.
  }

  const suffix = Math.random().toString(36).slice(2, 12); // NOSONAR (S2245) - telemetry dedupe only, never an auth/security token
  return `${Date.now().toString(36)}-${suffix}`;
}

function getAllowedConsentMode(): NavigationConsentMode | null {
  if (globalThis.window === undefined || !isAnalyticsAllowed()) return null;

  try {
    const raw = globalThis.localStorage?.getItem('jv_cc');
    if (raw) {
      const parsed = JSON.parse(raw) as { analytics?: unknown };
      return parsed.analytics === true ? 'explicit' : 'implicit';
    }
  } catch {
    // Consent helper already approved this browser. Treat unreadable detail as
    // implicit rather than attaching malformed storage to telemetry.
  }

  return getConsentState() === 'accepted' ? 'explicit' : 'implicit';
}

function resolvePlatform(
  context: NavigationTelemetryContext
): NavigationPlatform {
  if (context.isElectron) {
    return context.isMobile ? 'electron_mobile' : 'electron_desktop';
  }
  return context.isMobile ? 'web_mobile' : 'web_desktop';
}

function emitNavigationEvent(input: {
  readonly eventId: string;
  readonly event: NavigationTelemetryEvent;
  readonly itemId: NavigationItemId;
  readonly sourceRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly destinationRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly inputMethod: NavigationInputMethod;
  readonly context: NavigationTelemetryContext;
  readonly latencyMs?: number;
  readonly success: boolean;
}): NavigationTelemetryPayload | null {
  const consentMode = getAllowedConsentMode();
  if (!consentMode) return null;

  const payload: NavigationTelemetryPayload = {
    schema_version: NAVIGATION_TELEMETRY_SCHEMA_VERSION,
    event_id: input.eventId,
    event: input.event,
    item_id: input.itemId,
    source_route: input.sourceRoute,
    destination_route: input.destinationRoute,
    input_method: input.inputMethod,
    platform: resolvePlatform(input.context),
    nav_variant: input.context.navVariant,
    consent_mode: consentMode,
    latency_bucket:
      input.latencyMs === undefined
        ? 'na'
        : bucketNavigationLatency(input.latencyMs),
    success: input.success,
  };

  postJsonBeacon(NAVIGATION_TELEMETRY_ENDPOINT, payload);
  return payload;
}

export function navigationInputMethodFromClick(detail: number) {
  return detail === 0 ? 'keyboard' : 'pointer';
}

function canonicalNavigationPath(value: string): string {
  const path = value.split(/[?#]/, 1)[0] || '/';
  return path === '/' ? path : path.replace(/\/+$/, '');
}

/**
 * Records visible nav items, with a one-second duplicate guard for React
 * strict-mode effect replay. A later real revisit remains countable.
 */
export function trackNavigationImpressions(
  itemIds: readonly string[],
  pathname: string,
  context: NavigationTelemetryContext,
  recordedAt = nowMs()
): readonly NavigationTelemetryPayload[] {
  const route = bucketNavigationRoute(pathname);
  const platform = resolvePlatform(context);
  const emitted: NavigationTelemetryPayload[] = [];

  for (const rawItemId of itemIds) {
    const itemId = allowlistNavigationItemId(rawItemId);
    const dedupeKey = `${platform}:${context.navVariant}:${route}:${itemId}`;
    const recent = recentImpressions.get(dedupeKey);
    if (recent && recordedAt - recent.recordedAt < 1000) continue;

    const payload = emitNavigationEvent({
      eventId: `${createOpaqueId()}:impression`,
      event: 'impression',
      itemId,
      sourceRoute: route,
      destinationRoute: route,
      inputMethod: 'none',
      context,
      success: true,
    });
    if (!payload) continue;

    recentImpressions.set(dedupeKey, { recordedAt });
    emitted.push(payload);
  }

  return emitted;
}

function recordPendingDropOff(
  navigation: PendingNavigation,
  recordedAt: number
): NavigationTelemetryPayload | null {
  return emitNavigationEvent({
    eventId: `${navigation.navigationId}:drop_off`,
    event: 'drop_off',
    itemId: navigation.itemId,
    sourceRoute: navigation.sourceRoute,
    destinationRoute: navigation.destinationRoute,
    inputMethod: navigation.inputMethod,
    context: navigation.context,
    latencyMs: recordedAt - navigation.startedAt,
    success: false,
  });
}

export function startNavigationTelemetry(input: {
  readonly itemId: string;
  readonly sourcePathname: string;
  readonly destinationHref: string;
  readonly inputMethod: NavigationInputMethod;
  readonly context: NavigationTelemetryContext;
  readonly startedAt?: number;
}): NavigationTelemetryPayload | null {
  if (
    canonicalNavigationPath(input.sourcePathname) ===
    canonicalNavigationPath(input.destinationHref)
  ) {
    return null;
  }

  const startedAt = input.startedAt ?? nowMs();
  const itemId = allowlistNavigationItemId(input.itemId);
  const sourceRoute = bucketNavigationRoute(input.sourcePathname);
  const destinationRoute = bucketNavigationRoute(input.destinationHref);
  const navigationId = createOpaqueId();

  if (!getAllowedConsentMode()) return null;

  if (pendingNavigation) {
    clearTimeout(pendingNavigation.timeoutId);
    recordPendingDropOff(pendingNavigation, startedAt);
    pendingNavigation = null;
  }

  if (
    lastReadyNavigation &&
    destinationRoute === lastReadyNavigation.sourceRoute &&
    startedAt - lastReadyNavigation.readyAt <= NAVIGATION_SHORT_RETURN_MS
  ) {
    emitNavigationEvent({
      eventId: `${navigationId}:short_return`,
      event: 'short_return',
      itemId,
      sourceRoute,
      destinationRoute,
      inputMethod: input.inputMethod,
      context: input.context,
      latencyMs: startedAt - lastReadyNavigation.readyAt,
      success: false,
    });
  }

  const activation = emitNavigationEvent({
    eventId: `${navigationId}:activation`,
    event: 'activation',
    itemId,
    sourceRoute,
    destinationRoute,
    inputMethod: input.inputMethod,
    context: input.context,
    success: false,
  });
  if (!activation) return null;

  const timeoutId = setTimeout(() => {
    if (pendingNavigation?.navigationId !== navigationId) return;
    const timedOutNavigation = pendingNavigation;
    pendingNavigation = null;
    recordPendingDropOff(timedOutNavigation, nowMs());
  }, NAVIGATION_DROP_OFF_MS);

  pendingNavigation = {
    navigationId,
    itemId,
    sourceRoute,
    destinationRoute,
    inputMethod: input.inputMethod,
    context: input.context,
    startedAt,
    timeoutId,
  };

  return activation;
}

/**
 * Called only by the destination surface after its own data and usable UI are
 * ready. A route commit alone is deliberately insufficient.
 */
export function markNavigationDestinationReady(
  destinationRoute: NavigationRouteBucket,
  readyAt = nowMs()
): NavigationTelemetryPayload | null {
  const navigation = pendingNavigation;
  if (!navigation || destinationRoute !== navigation.destinationRoute) {
    return null;
  }

  pendingNavigation = null;
  clearTimeout(navigation.timeoutId);
  const payload = emitNavigationEvent({
    eventId: `${navigation.navigationId}:destination_ready`,
    event: 'destination_ready',
    itemId: navigation.itemId,
    sourceRoute: navigation.sourceRoute,
    destinationRoute: navigation.destinationRoute,
    inputMethod: navigation.inputMethod,
    context: navigation.context,
    latencyMs: readyAt - navigation.startedAt,
    success: true,
  });

  if (payload) {
    lastReadyNavigation = {
      sourceRoute: navigation.sourceRoute,
      destinationRoute: navigation.destinationRoute,
      readyAt,
    };
  }
  return payload;
}

export function resetNavigationTelemetryForTests(): void {
  if (pendingNavigation) clearTimeout(pendingNavigation.timeoutId);
  pendingNavigation = null;
  lastReadyNavigation = null;
  recentImpressions.clear();
}
