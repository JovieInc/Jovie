import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...actual, setConsentState: vi.fn() };
});

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('CookieBannerSection consent sync', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
  });

  it('calls setConsentState accepted on acceptAll', async () => {
    const { setConsentState } = await import('@/lib/tracking/consent');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    const btn = screen.getByRole('button', { name: /accept all/i });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(setConsentState).toHaveBeenCalledWith('accepted');
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.marketing).toBe(true);
    });
  });

  it('calls setConsentState rejected on reject', async () => {
    const { setConsentState } = await import('@/lib/tracking/consent');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    const btn = screen.getByRole('button', { name: /reject/i });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(setConsentState).toHaveBeenCalledWith('rejected');
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.marketing).toBe(false);
    });
  });
});

describe('CookieModal loads saved preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes with saved preferences from localStorage', async () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    const analyticsSwitch = screen.getByRole('switch', { name: /analytics/i });
    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i });

    expect(analyticsSwitch).toBeChecked();
    expect(marketingSwitch).toBeChecked();
  });

  it('defaults to off when no saved preferences', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    const analyticsSwitch = screen.getByRole('switch', { name: /analytics/i });
    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i });

    expect(analyticsSwitch).not.toBeChecked();
    expect(marketingSwitch).not.toBeChecked();
  });

  it('has accessible dialog description', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    expect(
      screen.getByText('Manage your cookie preferences')
    ).toBeInTheDocument();
  });
});

describe('CookieSettingsFooterButton visibility', () => {
  afterEach(() => {
    setCookie('');
  });

  it('renders nothing when jv_cc_required is 0', async () => {
    setCookie('jv_cc_required=0');
    const { CookieSettingsFooterButton } = await import(
      '@/components/molecules/CookieSettingsFooterButton'
    );
    const { container } = render(<CookieSettingsFooterButton />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders button when jv_cc_required is 1', async () => {
    setCookie('jv_cc_required=1');
    const { CookieSettingsFooterButton } = await import(
      '@/components/molecules/CookieSettingsFooterButton'
    );
    render(<CookieSettingsFooterButton />);
    expect(
      screen.getByRole('button', { name: /cookie settings/i })
    ).toBeInTheDocument();
  });

  it('dispatches jv:cookie:open event on click', async () => {
    setCookie('jv_cc_required=1');
    const { CookieSettingsFooterButton } = await import(
      '@/components/molecules/CookieSettingsFooterButton'
    );
    render(<CookieSettingsFooterButton />);

    const handler = vi.fn();
    window.addEventListener('jv:cookie:open', handler);

    fireEvent.click(screen.getByRole('button', { name: /cookie settings/i }));
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener('jv:cookie:open', handler);
  });
});
