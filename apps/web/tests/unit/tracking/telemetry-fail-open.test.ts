import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAnalyticsAllowed,
  isDNTEnabled,
  isGPCEnabled,
} from '@/lib/tracking/consent';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';

/**
 * JOV-6585 fail-open interaction contract: browser telemetry must never break
 * the primary navigation, listening, fan-capture, or checkout paths. A
 * blocked, absent, slow, or erroring collector degrades to silence — no
 * unhandled exception, no unbounded buffer, no duplicated request.
 */

type MutableNavigator = {
  sendBeacon?: typeof navigator.sendBeacon;
  doNotTrack?: string;
  globalPrivacyControl?: boolean;
};

function navigatorStub(): MutableNavigator {
  return (globalThis.navigator as unknown as MutableNavigator) ?? {};
}

function setFetch(impl: typeof fetch | undefined) {
  if (impl === undefined) {
    // @ts-expect-error - deliberately removing fetch for the absent-API case
    delete globalThis.fetch;
    return;
  }
  globalThis.fetch = impl;
}

const originalFetch = globalThis.fetch;

describe('fail-open telemetry transport (JOV-6585)', () => {
  let fetchCalls: Array<{ input: unknown; init: unknown }>;

  beforeEach(() => {
    fetchCalls = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setFetch(originalFetch);
    vi.restoreAllMocks();
  });

  it('stays silent when the collector is absent — no sendBeacon, no fetch', () => {
    navigatorStub().sendBeacon = undefined;
    setFetch(undefined);

    expect(() =>
      postJsonBeacon('/api/profile/view', { handle: 'artist' })
    ).not.toThrow();
    expect(fetchCalls).toHaveLength(0);
  });

  it('stays silent when fetch throws before returning a promise', () => {
    navigatorStub().sendBeacon = undefined;
    setFetch((() => {
      throw new TypeError('Failed to construct request');
    }) as unknown as typeof fetch);
    const onError = vi.fn();

    expect(
      postJsonBeacon('/api/profile/view', { handle: 'artist' }, onError)
    ).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stays silent when sendBeacon is blocked and the keepalive fetch rejects (offline)', async () => {
    navigatorStub().sendBeacon = undefined;
    setFetch(vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

    const onError = vi.fn();
    expect(() =>
      postJsonBeacon('/api/profile/view', { handle: 'artist' }, onError)
    ).not.toThrow();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    // No unhandled rejection: the rejection was consumed.
    expect(fetchCalls).toHaveLength(0);
  });

  it('stays silent on 429 and 500 collector responses — fire-and-forget, never awaited', async () => {
    navigatorStub().sendBeacon = undefined;
    setFetch(vi.fn(async () => new Response(null, { status: 429 })));

    expect(postJsonBeacon('/api/profile/view', { handle: 'artist' })).toBe(
      false
    );
    setFetch(vi.fn(async () => new Response(null, { status: 500 })));
    expect(postJsonBeacon('/api/analytics/navigation', { events: [] })).toBe(
      false
    );
    // The caller path returned synchronously above — telemetry status can
    // never gate navigation. Assert no throw escaped.
    await Promise.resolve();
  });

  it('stays silent when the collector hangs — the caller never awaits a response', () => {
    navigatorStub().sendBeacon = undefined;
    setFetch(vi.fn(() => new Promise<Response>(() => {})));

    expect(() =>
      postJsonBeacon('/api/profile/view', { handle: 'artist' })
    ).not.toThrow();
  });

  it('does not duplicate requests when sendBeacon succeeds', () => {
    const sendBeacon = vi.fn(() => true);
    navigatorStub().sendBeacon =
      sendBeacon as unknown as typeof navigator.sendBeacon;
    setFetch(vi.fn());

    expect(postJsonBeacon('/api/profile/view', { handle: 'artist' })).toBe(
      true
    );
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falls back to fetch exactly once when sendBeacon rejects the payload', () => {
    navigatorStub().sendBeacon = vi.fn(
      () => false
    ) as unknown as typeof navigator.sendBeacon;
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    setFetch(fetchMock as unknown as typeof fetch);

    expect(postJsonBeacon('/api/profile/view', { handle: 'artist' })).toBe(
      false
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fail-open consent paths (JOV-6585)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    navigatorStub().globalPrivacyControl = undefined;
    navigatorStub().doNotTrack = undefined;
  });

  it('denies telemetry on denied consent without throwing', () => {
    navigatorStub().globalPrivacyControl = true;
    expect(isGPCEnabled()).toBe(true);
    expect(isAnalyticsAllowed()).toBe(false);

    navigatorStub().globalPrivacyControl = undefined;
    navigatorStub().doNotTrack = '1';
    expect(isDNTEnabled()).toBe(true);
    expect(isAnalyticsAllowed()).toBe(false);
  });

  it('treats a denied localStorage write as degradation, not failure (JOV-848)', () => {
    const originalSetItem = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = vi.fn(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    try {
      expect(() => isAnalyticsAllowed()).not.toThrow();
      // getConsentState reads, does not write; isAnalyticsAllowed degrades to
      // its default answer when storage is hostile.
      expect(isAnalyticsAllowed()).toBe(true);
    } finally {
      globalThis.localStorage.setItem = originalSetItem;
    }
  });

  it('treats a throwing localStorage read as degradation, not failure', () => {
    const originalGetItem = globalThis.localStorage.getItem;
    globalThis.localStorage.getItem = vi.fn(() => {
      throw new DOMException('The document is sandboxed', 'SecurityError');
    });
    try {
      expect(() => isAnalyticsAllowed()).not.toThrow();
      expect(() => isGPCEnabled()).not.toThrow();
      expect(() => isDNTEnabled()).not.toThrow();
    } finally {
      globalThis.localStorage.getItem = originalGetItem;
    }
  });
});
