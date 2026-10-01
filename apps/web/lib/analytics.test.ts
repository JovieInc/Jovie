import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-client', () => ({
  env: { IS_DEV: false },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'https://jovie.test' },
}));

import { track, trackMagicMomentIfReady } from './analytics';

const READY_PARAMS = {
  profileId: 'profile-1',
  hasAvatar: true,
  hasDisplayName: true,
  dspLinkCount: 1,
  releaseCount: 1,
  signupTimestamp: Date.now() - 1_000,
  enrichmentStatus: 'ready',
};

type MutableWindow = {
  gtag?: (...args: unknown[]) => void;
  location: { hostname: string };
};

function setWindow(win: MutableWindow | undefined) {
  if (win === undefined) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = win;
}

describe('client analytics delivery contract', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    setWindow(undefined);
    vi.unstubAllGlobals();
  });

  it('reports skipped dispatch when gtag is absent', () => {
    setWindow({ location: { hostname: 'jovie.test' } });
    expect(track('checkout_initiated')).toBe('skipped_no_transport');
  });

  it('reports dispatch when gtag is present', () => {
    const gtag = vi.fn();
    setWindow({ gtag, location: { hostname: 'jovie.test' } });
    expect(track('checkout_initiated')).toBe('dispatched');
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'checkout_initiated',
      expect.objectContaining({ env: 'prod' })
    );
  });

  it('does not write the magic moment marker when dispatch is skipped', () => {
    setWindow({ location: { hostname: 'jovie.test' } });

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(storage.has('magic_moment_achieved_profile-1')).toBe(false);
  });

  it('does not write the marker when gtag throws', () => {
    setWindow({
      gtag: () => {
        throw new Error('blocked');
      },
      location: { hostname: 'jovie.test' },
    });

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(storage.has('magic_moment_achieved_profile-1')).toBe(false);
  });

  it('marks dispatch only after gtag accepts the event, once', () => {
    const gtag = vi.fn();
    setWindow({ gtag, location: { hostname: 'jovie.test' } });

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(storage.has('magic_moment_achieved_profile-1')).toBe(true);
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it('retries on a later call after a skipped dispatch', () => {
    setWindow({ location: { hostname: 'jovie.test' } });
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(false);

    const gtag = vi.fn();
    setWindow({ gtag, location: { hostname: 'jovie.test' } });
    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
  });

  it('still dispatches when localStorage throws', () => {
    const gtag = vi.fn();
    setWindow({ gtag, location: { hostname: 'jovie.test' } });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });

    expect(trackMagicMomentIfReady(READY_PARAMS)).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});
