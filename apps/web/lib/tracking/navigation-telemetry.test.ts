import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIsAnalyticsAllowed, mockGetConsentState, mockPostJsonBeacon } =
  vi.hoisted(() => ({
    mockIsAnalyticsAllowed: vi.fn(() => true),
    mockGetConsentState: vi.fn(() => 'accepted'),
    mockPostJsonBeacon: vi.fn(() => true),
  }));

vi.mock('@/lib/tracking/consent', () => ({
  isAnalyticsAllowed: mockIsAnalyticsAllowed,
  getConsentState: mockGetConsentState,
}));
vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: mockPostJsonBeacon,
}));

import {
  markNavigationDestinationReady,
  NAVIGATION_DROP_OFF_MS,
  navigationInputMethodFromClick,
  resetNavigationTelemetryForTests,
  startNavigationTelemetry,
  trackNavigationImpressions,
} from './navigation-telemetry';
import {
  NAVIGATION_TELEMETRY_ENDPOINT,
  type NavigationTelemetryBatch,
  type NavigationTelemetryPayload,
} from './navigation-telemetry-contract';

function emittedPayloads(): NavigationTelemetryPayload[] {
  return (
    mockPostJsonBeacon.mock.calls as unknown as Array<
      [string, NavigationTelemetryBatch]
    >
  ).flatMap(([, batch]) => batch.events);
}

const CONTEXT = {
  isElectron: false,
  isMobile: false,
  navVariant: 'canonical_customer_ia_v1',
} as const;

describe('navigation telemetry client', () => {
  beforeEach(() => {
    resetNavigationTelemetryForTests();
    localStorage.clear();
    mockIsAnalyticsAllowed.mockReturnValue(true);
    mockGetConsentState.mockReturnValue('accepted');
    mockPostJsonBeacon.mockClear();
    vi.useRealTimers();
  });

  it('is a complete no-op when analytics consent is unavailable', () => {
    mockIsAnalyticsAllowed.mockReturnValue(false);

    expect(
      trackNavigationImpressions(['inbox', 'chat'], '/app', CONTEXT)
    ).toEqual([]);
    expect(
      startNavigationTelemetry({
        itemId: 'library',
        sourcePathname: '/app/chat/private-thread',
        destinationHref: '/app/library?search=private',
        inputMethod: 'pointer',
        context: CONTEXT,
      })
    ).toBeNull();
    expect(mockPostJsonBeacon).not.toHaveBeenCalled();
  });

  it('emits one activation and one ready event with only bucketed dimensions', () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: false })
    );

    const activation = startNavigationTelemetry({
      itemId: 'library',
      sourcePathname: '/app/chat/private-thread?message=secret',
      destinationHref: '/app/library?search=private-artist',
      inputMethod: 'pointer',
      context: CONTEXT,
      startedAt: 100,
    });
    const wrongDestination = markNavigationDestinationReady('contacts', 450);
    const ready = markNavigationDestinationReady('library', 460);
    const duplicateReady = markNavigationDestinationReady('library', 500);

    expect(activation).toMatchObject({
      event: 'activation',
      source_route: 'chat',
      destination_route: 'library',
      consent_mode: 'explicit',
    });
    expect(ready).toMatchObject({
      event: 'destination_ready',
      latency_bucket: 'le_500ms',
      success: true,
    });
    expect(wrongDestination).toBeNull();
    expect(duplicateReady).toBeNull();
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(2);
    expect(mockPostJsonBeacon).toHaveBeenNthCalledWith(
      1,
      NAVIGATION_TELEMETRY_ENDPOINT,
      {
        schema_version: 1,
        events: [activation],
      }
    );
    expect(JSON.stringify([activation, ready])).not.toContain('private');
  });

  it('deduplicates impression effect replay but allows a later revisit', () => {
    expect(
      trackNavigationImpressions(['inbox'], '/app', CONTEXT, 100)
    ).toHaveLength(1);
    expect(trackNavigationImpressions(['inbox'], '/app', CONTEXT, 150)).toEqual(
      []
    );
    expect(
      trackNavigationImpressions(['inbox'], '/app', CONTEXT, 1100)
    ).toHaveLength(1);
  });

  it('emits visible impressions as one bounded batch', () => {
    const emitted = trackNavigationImpressions(
      ['inbox', 'chat', 'library', 'contacts', 'calendar', 'tasks', 'settings'],
      '/app',
      CONTEXT,
      100
    );

    expect(emitted).toHaveLength(7);
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(1);
    expect(mockPostJsonBeacon).toHaveBeenCalledWith(
      NAVIGATION_TELEMETRY_ENDPOINT,
      {
        schema_version: 1,
        events: emitted,
      }
    );
  });

  it('does not start telemetry for an already-active destination', () => {
    expect(
      startNavigationTelemetry({
        itemId: 'library',
        sourcePathname: '/app/library?view=grid',
        destinationHref: '/app/library/',
        inputMethod: 'pointer',
        context: CONTEXT,
        startedAt: 100,
      })
    ).toBeNull();
    expect(mockPostJsonBeacon).not.toHaveBeenCalled();
  });

  it('records one bounded drop-off when destination ready never arrives', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'));

    startNavigationTelemetry({
      itemId: 'tasks',
      sourcePathname: '/app',
      destinationHref: '/app/tasks',
      inputMethod: 'keyboard',
      context: CONTEXT,
      startedAt: 0,
    });
    vi.advanceTimersByTime(NAVIGATION_DROP_OFF_MS);

    const payloads = emittedPayloads();
    expect(payloads.map(payload => payload.event)).toEqual([
      'activation',
      'drop_off',
    ]);
    expect(payloads[1]).toMatchObject({ success: false });
  });

  it('derives a short return without storing a route history or identity', () => {
    startNavigationTelemetry({
      itemId: 'library',
      sourcePathname: '/app/chat',
      destinationHref: '/app/library',
      inputMethod: 'pointer',
      context: CONTEXT,
      startedAt: 100,
    });
    markNavigationDestinationReady('library', 400);

    startNavigationTelemetry({
      itemId: 'chat',
      sourcePathname: '/app/library',
      destinationHref: '/app/chat',
      inputMethod: 'keyboard',
      context: CONTEXT,
      startedAt: 1000,
    });

    const payloads = emittedPayloads();
    expect(payloads.map(payload => payload.event)).toEqual([
      'activation',
      'destination_ready',
      'short_return',
      'activation',
    ]);
    expect(mockPostJsonBeacon).toHaveBeenCalledTimes(3);
  });

  it('classifies keyboard and pointer clicks without inspecting content', () => {
    expect(navigationInputMethodFromClick(0)).toBe('keyboard');
    expect(navigationInputMethodFromClick(1)).toBe('pointer');
  });
});
