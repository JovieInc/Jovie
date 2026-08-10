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
let _pathname = '/';
let _isTest = false;
let _isE2E = false;

// Mock next/script to a plain element
vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => (
    <script data-testid='next-script' {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => _pathname,
}));

let _pixelId: string | undefined = 'test-pixel-id';

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

// Import the component AFTER mocks are set up
let InstantlyPixel: typeof import('@/components/providers/InstantlyPixel').InstantlyPixel;

beforeAll(async () => {
  const mod = await import('@/components/providers/InstantlyPixel');
  InstantlyPixel = mod.InstantlyPixel;
});

function hasScript(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="next-script"]') !== null;
}

describe('InstantlyPixel', () => {
  beforeEach(() => {
    _pixelId = 'test-pixel-id';
    _pathname = '/';
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    _marketingAllowed = true;
    globalThis.JVConsent = undefined;
    delete document.documentElement.dataset.instantlyRuntime;
  });

  afterEach(() => {
    cleanup();
  });

  it('disables the opaque vendor runtime when consent and route gates pass', async () => {
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    await waitFor(() =>
      expect(document.documentElement.dataset.instantlyRuntime).toBe(
        'disabled-vendor-runtime-isolation'
      )
    );
  });

  it('reports an unconfigured integration without loading a script', () => {
    _pixelId = undefined;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-unconfigured'
    );
  });

  it.each([
    '/signin',
    '/signup',
    '/app/dashboard',
    '/onboarding/handle',
    '/billing/success',
    '/sso-callback',
    '/some-new-auth-route',
  ])('fails closed on denied route %s', pathname => {
    _pathname = pathname;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-route'
    );
  });

  it('does not treat a similarly named route as allowlisted', () => {
    _pathname = '/about-us';
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-route'
    );
  });

  it('suppresses passive and demo-recording runtimes', () => {
    _isTest = true;
    const { container, unmount } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-passive-runtime'
    );

    unmount();
    _isTest = false;
    _isDemo = true;
    render(<InstantlyPixel />);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-demo-recording'
    );
  });

  it('keeps rejection consent-gated without loading the vendor', () => {
    _marketingAllowed = false;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
    expect(document.documentElement.dataset.instantlyRuntime).toBe(
      'suppressed-no-consent'
    );
  });
});

describe('isMarketingAllowed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true when jv_cc has marketing: true', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isMarketingAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );
    expect(isMarketingAllowed()).toBe(true);
  });

  it('returns false when jv_cc has marketing: false', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isMarketingAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: false })
    );
    expect(isMarketingAllowed()).toBe(false);
  });

  it('returns true when jv_cc is missing (no consent interaction)', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isMarketingAllowed } = await import('@/lib/tracking/consent');
    expect(isMarketingAllowed()).toBe(true);
  });

  it('returns true when jv_cc is malformed JSON', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isMarketingAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem('jv_cc', 'not-json');
    expect(isMarketingAllowed()).toBe(true);
  });

  it('returns false when legacy jovie_tracking_consent is rejected (no jv_cc)', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isMarketingAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem('jovie_tracking_consent', 'rejected');
    expect(isMarketingAllowed()).toBe(false);
  });
});
