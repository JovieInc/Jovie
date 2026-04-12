import { cleanup, render } from '@testing-library/react';
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
let _gpcEnabled = false;
let _dntEnabled = false;
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
    isGPCEnabled: () => _gpcEnabled,
    isDNTEnabled: () => _dntEnabled,
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

function getScriptAttr(container: HTMLElement, attr: string): string | null {
  return (
    container
      .querySelector('[data-testid="next-script"]')
      ?.getAttribute(attr) ?? null
  );
}

describe('InstantlyPixel', () => {
  beforeEach(() => {
    _pixelId = 'test-pixel-id';
    _pathname = '/';
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    _marketingAllowed = true;
    _gpcEnabled = false;
    _dntEnabled = false;
    globalThis.JVConsent = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Script with correct attributes when all conditions are met', () => {
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(true);
    expect(getScriptAttr(container, 'data-pid')).toBe('test-pixel-id');
    expect(getScriptAttr(container, 'data-version')).toBe('062024');
    expect(getScriptAttr(container, 'src')).toBe('https://r2.leadsy.ai/tag.js');
    expect(getScriptAttr(container, 'strategy')).toBe('lazyOnload');
  });

  it('returns null when NEXT_PUBLIC_INSTANTLY_PIXEL_ID is not set', () => {
    _pixelId = undefined;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null on /app/dashboard route', () => {
    _pathname = '/app/dashboard';
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null on /onboarding route', () => {
    _pathname = '/onboarding/handle';
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null on /billing route', () => {
    _pathname = '/billing/success';
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null in test runtime', () => {
    _isTest = true;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null in demo recording mode', () => {
    _isDemo = true;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null when marketing consent is rejected', () => {
    _marketingAllowed = false;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('returns null when GPC is enabled', () => {
    _gpcEnabled = true;
    // isMarketingAllowed checks GPC internally, but we mock it separately
    _marketingAllowed = false;
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(false);
  });

  it('renders on public routes like /pricing', () => {
    _pathname = '/pricing';
    const { container } = render(<InstantlyPixel />);
    expect(hasScript(container)).toBe(true);
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
});
