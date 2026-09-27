import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-client', () => ({
  env: { IS_DEV: true },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'https://jovie.test' },
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: vi.fn(),
  useAppFlagWithLoading: vi.fn(),
}));

import { track, trackMagicMomentIfReady } from './analytics';

const READY_PARAMS = {
  profileId: 'profile-1',
  hasAvatar: true,
  hasDisplayName: true,
  dspLinkCount: 1,
  releaseCount: 1,
  signupTimestamp: Date.now() - 1000,
  enrichmentStatus: 'complete',
};

const MARKER_KEY = 'magic_moment_achieved_profile-1';

type MutableStorage = Pick<Storage, 'getItem' | 'setItem'>;

function setWindow(
  gtag?: (
    command: string,
    event: string,
    properties?: Record<string, unknown>
  ) => void
) {
  Object.defineProperty(globalThis, 'window', {
    value: { gtag, location: { hostname: 'localhost' } },
    configurable: true,
    writable: true,
  });
}

describe('client analytics delivery contract', () => {
  let storage: Map<string, string>;
  let storageImpl: MutableStorage;

  beforeEach(() => {
    storage = new Map();
    storageImpl = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageImpl,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error -- reset test-global window
    delete globalThis.window;
  });

  it('does not set the dispatch marker when gtag is unavailable', () => {
    setWindow(undefined);

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(storage.has(MARKER_KEY)).toBe(false);
  });

  it('does not set the dispatch marker when gtag throws', () => {
    setWindow(
      vi.fn(() => {
        throw new Error('gtag failed');
      })
    );

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(storage.has(MARKER_KEY)).toBe(false);
  });

  it('records a dispatch marker only after a real gtag invocation', () => {
    const gtag = vi.fn();
    setWindow(gtag);

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'magic_moment_achieved',
      expect.objectContaining({ dspLinkCount: 1 })
    );
    expect(storage.has(MARKER_KEY)).toBe(true);
  });

  it('fires after a late loader even if an earlier call was skipped', () => {
    setWindow(undefined);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);

    const gtag = vi.fn();
    setWindow(gtag);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('dispatches only once per profile across repeated calls', () => {
    const gtag = vi.fn();
    setWindow(gtag);

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('still dispatches when storage reads throw (blocked storage)', () => {
    storageImpl.getItem = vi.fn(() => {
      throw new Error('SecurityError');
    });
    storageImpl.setItem = vi.fn(() => {
      throw new Error('SecurityError');
    });
    const gtag = vi.fn();
    setWindow(gtag);

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('returns false without dispatch when the profile is not ready', () => {
    const gtag = vi.fn();
    setWindow(gtag);

    expect(trackMagicMomentIfReady({ ...READY_PARAMS, hasAvatar: false })).toBe(
      false
    );
    expect(gtag).not.toHaveBeenCalled();
    expect(storage.has(MARKER_KEY)).toBe(false);
  });

  it('track() never throws when gtag is missing or blocked', () => {
    setWindow(undefined);
    expect(() => track('checkout_initiated')).not.toThrow();
  });
});
