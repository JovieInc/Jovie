import { recordUxLatency } from '@/lib/monitoring/interaction-latency';
import { getConsentState, isAnalyticsAllowed } from '@/lib/tracking/consent';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  allowlistNavigationItemId,
  bucketNavigationLatency,
  bucketNavigationRoute,
  NAVIGATION_TELEMETRY_ENDPOINT,
  NAVIGATION_TELEMETRY_MAX_BATCH_SIZE,
  NAVIGATION_TELEMETRY_SCHEMA_VERSION,
  type NavigationConsentMode,
  type NavigationInputMethod,
  type NavigationItemId,
  type NavigationPlatform,
  type NavigationRouteBucket,
  type NavigationTelemetryBatch,
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

interface PendingUxNavigation {
  readonly destinationRoute: NavigationRouteBucket;
  readonly startedAt: number;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

let pendingNavigation: PendingNavigation | null = null;
let pendingUxNavigation: PendingUxNavigation | null = null;
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

interface NavigationEventInput {
  readonly eventId: string;
  readonly event: NavigationTelemetryEvent;
  readonly itemId: NavigationItemId;
  readonly sourceRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly destinationRoute: ReturnType<typeof bucketNavigationRoute>;
  readonly inputMethod: NavigationInputMethod;
  readonly context: NavigationTelemetryContext;
  readonly latencyMs?: number;
  readonly success: boolean;
}

function buildNavigationEvent(
  input: NavigationEventInput,
  consentMode: NavigationConsentMode
): NavigationTelemetryPayload {
  return {
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
}

function emitNavigationEvents(
  inputs: readonly NavigationEventInput[]
): readonly NavigationTelemetryPayload[] {
  const consentMode = getAllowedConsentMode();
  if (!consentMode || inputs.length === 0) return [];

  const events = inputs.map(input => buildNavigationEvent(input, consentMode));
  const batch: NavigationTelemetryBatch = {
    schema_version: NAVIGATION_TELEMETRY_SCHEMA_VERSION,
    events,
  };
  postJsonBeacon(NAVIGATION_TELEMETRY_ENDPOINT, batch);
  return events;
}

function emitNavigationEvent(
  input: NavigationEventInput
): NavigationTelemetryPayload | null {
  return emitNavigationEvents([input])[0] ?? null;
}

export function navigationInputMethodFromClick(detail: number) {
  return detail === 0 ? 'keyboard' : 'pointer';
}

function canonicalNavigationPath(value: string): string {
  const path = value.split(/[?#]/, 1)[0] || '/';
  return path === '/' ? path : path.replace(/\/+$/, '');
}

function startUxNavigationMeasurement(
  destinationRoute: NavigationRouteBucket,
  startedAt: number
): void {
  if (pendingUxNavigation) {
    clearTimeout(pendingUxNavigation.timeoutId);
  }
  const timeoutId = setTimeout(() => {
    pendingUxNavigation = null;
  }, NAVIGATION_DROP_OFF_MS);
  pendingUxNavigation = { destinationRoute, startedAt, timeoutId };
}

function completeUxNavigationMeasurement(
  destinationRoute: NavigationRouteBucket,
  readyAt: number
): void {
  const navigation = pendingUxNavigation;
  if (!navigation || destinationRoute !== navigation.destinationRoute) return;
  pendingUxNavigation = null;
  clearTimeout(navigation.timeoutId);
  recordUxLatency(
    'page_to_interactive',
    Math.max(0, readyAt - navigation.startedAt)
  );
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
  const inputs: NavigationEventInput[] = [];
  const acceptedDedupeKeys: string[] = [];

  for (const rawItemId of itemIds.slice(
    0,
    NAVIGATION_TELEMETRY_MAX_BATCH_SIZE
  )) {
    const itemId = allowlistNavigationItemId(rawItemId);
    const dedupeKey = `${platform}:${context.navVariant}:${route}:${itemId}`;
    const recent = recentImpressions.get(dedupeKey);
    if (recent && recordedAt - recent.recordedAt < 1000) continue;

    inputs.push({
      eventId: `${createOpaqueId()}:impression`,
      event: 'impression',
      itemId,
      sourceRoute: route,
      destinationRoute: route,
      inputMethod: 'none',
      context,
      success: true,
    });
    acceptedDedupeKeys.push(dedupeKey);
  }

  const emitted = emitNavigationEvents(inputs);
  if (emitted.length > 0) {
    for (const dedupeKey of acceptedDedupeKeys) {
      recentImpressions.set(dedupeKey, { recordedAt });
    }
  }
  return emitted;
}

function pendingDropOffInput(
  navigation: PendingNavigation,
  recordedAt: number
): NavigationEventInput {
  return {
    eventId: `${navigation.navigationId}:drop_off`,
    event: 'drop_off',
    itemId: navigation.itemId,
    sourceRoute: navigation.sourceRoute,
    destinationRoute: navigation.destinationRoute,
    inputMethod: navigation.inputMethod,
    context: navigation.context,
    latencyMs: recordedAt - navigation.startedAt,
    success: false,
  };
}

function recordPendingDropOff(
  navigation: PendingNavigation,
  recordedAt: number
): NavigationTelemetryPayload | null {
  return emitNavigationEvent(pendingDropOffInput(navigation, recordedAt));
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
  startUxNavigationMeasurement(destinationRoute, startedAt);

  if (!getAllowedConsentMode()) return null;

  const pendingInputs: NavigationEventInput[] = [];
  if (pendingNavigation) {
    clearTimeout(pendingNavigation.timeoutId);
    pendingInputs.push(pendingDropOffInput(pendingNavigation, startedAt));
    pendingNavigation = null;
  }

  if (
    lastReadyNavigation &&
    destinationRoute === lastReadyNavigation.sourceRoute &&
    startedAt - lastReadyNavigation.readyAt <= NAVIGATION_SHORT_RETURN_MS
  ) {
    pendingInputs.push({
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

  pendingInputs.push({
    eventId: `${navigationId}:activation`,
    event: 'activation',
    itemId,
    sourceRoute,
    destinationRoute,
    inputMethod: input.inputMethod,
    context: input.context,
    success: false,
  });
  const activation = emitNavigationEvents(pendingInputs).find(
    payload => payload.event === 'activation'
  );
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
  completeUxNavigationMeasurement(destinationRoute, readyAt);
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
  if (pendingUxNavigation) clearTimeout(pendingUxNavigation.timeoutId);
  pendingNavigation = null;
  pendingUxNavigation = null;
  lastReadyNavigation = null;
  recentImpressions.clear();
}
