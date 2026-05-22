import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSaveConsent = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: mockSaveConsent,
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
  // Floating card redesign (bottom-right compact surface) preserves all action handlers,
  // persistence, error paths, and modal open. New render tested in sibling cookie-banner.test.tsx
  // (positioning, classes, height var, no Manage chrome, compact actions prop).
  beforeEach(() => {
    vi.resetModules();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
    globalThis.JVConsent = undefined;
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

  it('keeps banner visible on acceptAll when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: /accept all/i });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(localStorage.getItem('jv_cc')).toBeNull();
  });

  it('persists consent to localStorage after server action on acceptAll', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));

    await vi.waitFor(() => {
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toMatchObject({
        essential: true,
        analytics: true,
        marketing: true,
      });
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

  it('keeps banner visible on reject when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(localStorage.getItem('jv_cc')).toBeNull();
  });
});

describe('CookieModal loads saved preferences', () => {
  beforeEach(() => {
    mockSaveConsent.mockResolvedValue(undefined);
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    globalThis.JVConsent = undefined;
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

  it('exposes an accessible dialog description', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Manage your cookie preferences'
    );
  });

  it('calls onSave and onClose when Save Preferences succeeds', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps preferences open when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const onSave = vi.fn();
    const onClose = vi.fn();

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CookieBannerMount global preferences controller', () => {
  beforeEach(() => {
    mockSaveConsent.mockClear();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
    localStorage.clear();
    globalThis.JVConsent = undefined;
  });

  it('opens cookie preferences from the global menu event without a mounted banner', async () => {
    setCookie('jv_cc_required=0');
    const { CookieBannerMount } = await import(
      '@/components/organisms/CookieBannerMount'
    );

    render(<CookieBannerMount />);

    await vi.waitFor(() => {
      expect(globalThis.JVConsent).toBeDefined();
    });
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();

    globalThis.dispatchEvent(new CustomEvent('jv:cookie:open'));

    await vi.waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /cookie preferences/i })
      ).toBeInTheDocument();
    });
  });

  it('persists preferences opened from the global controller', async () => {
    setCookie('jv_cc_required=0');
    const { setConsentState } = await import('@/lib/tracking/consent');
    const { CookieBannerMount } = await import(
      '@/components/organisms/CookieBannerMount'
    );

    render(<CookieBannerMount />);

    await vi.waitFor(() => {
      expect(globalThis.JVConsent).toBeDefined();
    });

    globalThis.JVConsent?.openModal();

    await vi.waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /cookie preferences/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(mockSaveConsent).toHaveBeenCalledTimes(1);
      expect(setConsentState).toHaveBeenCalledWith('rejected');
      expect(localStorage.getItem('jv_cc')).toContain('"essential":true');
    });
  });
});

describe('CookieSettingsFooterButton visibility', () => {
  afterEach(() => {
    setCookie('');
    globalThis.JVConsent = undefined;
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
