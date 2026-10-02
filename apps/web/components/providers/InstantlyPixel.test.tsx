import { cleanup, render, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// --- Shared mock state ---
let _marketingAllowed = true;
let _isDemo = false;
let _isTest = false;
let _isE2E = false;
let _pixelId: string | undefined = 'instantly-px-1';
let _pathname: string | null = '/pricing';

vi.mock('next/navigation', () => ({
  usePathname: () => _pathname,
}));

vi.mock('@/lib/env-client', () => ({
  env: {
    get IS_TEST() {
      return _isTest;
    },
    get IS_E2E() {
      return _isE2E;
    },
  },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    get NEXT_PUBLIC_INSTANTLY_PIXEL_ID() {
      return _pixelId;
    },
  },
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => _isDemo,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return {
    ...original,
    isMarketingAllowed: () => _marketingAllowed,
  };
});

let InstantlyPixel: typeof import('./InstantlyPixel').InstantlyPixel;
let resolveInstantlyRuntimeState: typeof import('./InstantlyPixel').resolveInstantlyRuntimeState;

beforeAll(async () => {
  const mod = await import('./InstantlyPixel');
  InstantlyPixel = mod.InstantlyPixel;
  resolveInstantlyRuntimeState = mod.resolveInstantlyRuntimeState;
});

function runtimeAttr(): string | undefined {
  return globalThis.document?.documentElement.dataset.instantlyRuntime;
}

describe('resolveInstantlyRuntimeState', () => {
  const base = {
    hasPixelId: true,
    isPassive: false,
    isAllowed: true,
    isDemo: false,
    hasMarketingConsent: true,
  };

  it('gates in fail-closed order', () => {
    expect(resolveInstantlyRuntimeState({ ...base, hasPixelId: false })).toBe(
      'suppressed-unconfigured'
    );
    expect(resolveInstantlyRuntimeState({ ...base, isPassive: true })).toBe(
      'suppressed-passive-runtime'
    );
    expect(resolveInstantlyRuntimeState({ ...base, isAllowed: false })).toBe(
      'suppressed-route'
    );
    expect(resolveInstantlyRuntimeState({ ...base, isDemo: true })).toBe(
      'suppressed-demo-recording'
    );
    expect(
      resolveInstantlyRuntimeState({ ...base, hasMarketingConsent: false })
    ).toBe('suppressed-no-consent');
    expect(resolveInstantlyRuntimeState(base)).toBe(
      'disabled-vendor-runtime-isolation'
    );
  });
});

describe('InstantlyPixel', () => {
  beforeEach(() => {
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    _marketingAllowed = true;
    _pixelId = 'instantly-px-1';
    _pathname = '/pricing';
    globalThis.JVConsent = undefined;
    delete globalThis.document?.documentElement.dataset.instantlyRuntime;
  });

  afterEach(() => {
    cleanup();
    delete globalThis.document?.documentElement.dataset.instantlyRuntime;
  });

  it('exposes disabled-vendor-runtime-isolation on allowed marketing routes with consent', async () => {
    render(<InstantlyPixel />);
    await waitFor(() =>
      expect(runtimeAttr()).toBe('disabled-vendor-runtime-isolation')
    );
  });

  it('suppresses without marketing consent', async () => {
    _marketingAllowed = false;
    render(<InstantlyPixel />);
    await waitFor(() => expect(runtimeAttr()).toBe('suppressed-no-consent'));
  });

  it('suppresses on non-allowlisted routes', async () => {
    _pathname = '/signin';
    render(<InstantlyPixel />);
    await waitFor(() => expect(runtimeAttr()).toBe('suppressed-route'));
  });

  it('allows the exact root only, not every sub-path', async () => {
    _pathname = '/';
    const { unmount } = render(<InstantlyPixel />);
    await waitFor(() =>
      expect(runtimeAttr()).toBe('disabled-vendor-runtime-isolation')
    );
    unmount();
    _pathname = '/app/dashboard';
    render(<InstantlyPixel />);
    await waitFor(() => expect(runtimeAttr()).toBe('suppressed-route'));
  });

  it('suppresses in passive and demo runtimes', async () => {
    _isTest = true;
    const { unmount } = render(<InstantlyPixel />);
    await waitFor(() =>
      expect(runtimeAttr()).toBe('suppressed-passive-runtime')
    );
    unmount();
    _isTest = false;
    _isDemo = true;
    render(<InstantlyPixel />);
    await waitFor(() =>
      expect(runtimeAttr()).toBe('suppressed-demo-recording')
    );
  });

  it('suppresses when the pixel id is unconfigured', async () => {
    _pixelId = undefined;
    render(<InstantlyPixel />);
    await waitFor(() => expect(runtimeAttr()).toBe('suppressed-unconfigured'));
  });

  it('cleans up the runtime attribute on unmount', async () => {
    const { unmount } = render(<InstantlyPixel />);
    await waitFor(() =>
      expect(runtimeAttr()).toBe('disabled-vendor-runtime-isolation')
    );
    unmount();
    expect(runtimeAttr()).toBeUndefined();
  });
});
