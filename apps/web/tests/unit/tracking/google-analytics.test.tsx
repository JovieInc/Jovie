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

let _measurementId: string | undefined = 'G-TMY7Z8HK47';
let _isTest = false;
let _isE2E = false;
let _isDemo = false;

vi.mock('next/script', () => ({
  default: (props: Record<string, unknown>) => {
    const { children, ...rest } = props;
    return (
      <script data-testid='next-script' {...rest}>
        {children}
      </script>
    );
  },
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
    get NEXT_PUBLIC_GA_MEASUREMENT_ID() {
      return _measurementId;
    },
  },
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => _isDemo,
}));

let GoogleAnalytics: typeof import('@/components/providers/GoogleAnalytics').GoogleAnalytics;

beforeAll(async () => {
  const mod = await import('@/components/providers/GoogleAnalytics');
  GoogleAnalytics = mod.GoogleAnalytics;
});

function getScripts(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="next-script"]'));
}

describe('GoogleAnalytics', () => {
  beforeEach(() => {
    _measurementId = 'G-TMY7Z8HK47';
    _isTest = false;
    _isE2E = false;
    _isDemo = false;
    globalThis.JVConsent = undefined;
    globalThis.gtag = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the gtag loader and configures GA without inline script children', () => {
    const { container } = render(<GoogleAnalytics />);
    const scripts = getScripts(container);

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.id).toBe('ga-gtag-loader');
    expect(scripts[0]?.getAttribute('src')).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-TMY7Z8HK47'
    );
    expect(globalThis.gtag).toHaveBeenCalledWith('js', expect.any(Date));
    expect(globalThis.gtag).toHaveBeenCalledWith('config', 'G-TMY7Z8HK47');
  });

  it('returns null when measurement ID is missing', () => {
    _measurementId = undefined;
    const { container } = render(<GoogleAnalytics />);
    expect(getScripts(container)).toHaveLength(0);
  });

  it('returns null when measurement ID is invalid', () => {
    _measurementId = 'UA-123456-1';
    const { container } = render(<GoogleAnalytics />);
    expect(getScripts(container)).toHaveLength(0);
  });

  it('returns null in test runtime', () => {
    _isTest = true;
    const { container } = render(<GoogleAnalytics />);
    expect(getScripts(container)).toHaveLength(0);
  });

  it('returns null in demo recording mode', () => {
    _isDemo = true;
    const { container } = render(<GoogleAnalytics />);
    expect(getScripts(container)).toHaveLength(0);
  });

  it('updates Google consent mode when CookieBanner emits consent', async () => {
    const listeners = new Set<(value: unknown) => void>();
    globalThis.JVConsent = {
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      _emit(value) {
        listeners.forEach(listener => listener(value));
      },
      openModal: vi.fn(),
    };

    render(<GoogleAnalytics />);

    globalThis.JVConsent._emit({
      essential: true,
      analytics: true,
      marketing: false,
    });

    expect(globalThis.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });
});

describe('isAnalyticsAllowed', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie =
      'jv_cc_required=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('returns true when analytics consent is granted', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isAnalyticsAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: false })
    );
    expect(isAnalyticsAllowed()).toBe(true);
  });

  it('returns false when analytics consent is rejected', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isAnalyticsAllowed } = await import('@/lib/tracking/consent');
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: false, marketing: true })
    );
    expect(isAnalyticsAllowed()).toBe(false);
  });

  it('returns false in consent-required regions before a choice is stored', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isAnalyticsAllowed } = await import('@/lib/tracking/consent');
    document.cookie = 'jv_cc_required=1; path=/';
    expect(isAnalyticsAllowed()).toBe(false);
  });

  it('returns true outside consent-required regions before a choice is stored', async () => {
    vi.doUnmock('@/lib/tracking/consent');
    const { isAnalyticsAllowed } = await import('@/lib/tracking/consent');
    document.cookie = 'jv_cc_required=0; path=/';
    expect(isAnalyticsAllowed()).toBe(true);
  });
});
