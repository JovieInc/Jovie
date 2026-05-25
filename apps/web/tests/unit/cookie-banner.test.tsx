import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { shouldSuppressCookieBannerForPathname } from '@/lib/cookies/banner-visibility';

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn(),
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('CookieBannerSection', () => {
  afterEach(() => {
    setCookie('');
  });

  it('renders banner and buttons when jv_cc_required cookie is 1', () => {
    setCookie('jv_cc_required=1');
    render(<CookieBannerSection />);
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept all/i })
    ).toBeInTheDocument();
  });

  it('hides the banner when jv_cc_required cookie is absent', () => {
    setCookie('');
    render(<CookieBannerSection />);
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('hides the banner when jv_cc_required cookie is 0', () => {
    setCookie('jv_cc_required=0');
    render(<CookieBannerSection />);
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it.each([
    '/desktop-auth',
    '/auth/native-complete',
    '/signin',
    '/signin/sso-callback',
    '/signup',
    '/sign-in',
    '/sign-up',
    '/sso-callback',
  ])('suppresses auth utility route %s', pathname => {
    expect(shouldSuppressCookieBannerForPathname(pathname)).toBe(true);
  });

  it('renders as floating bottom-right card (not full-width bar) with correct classes and compact actions when required', () => {
    setCookie('jv_cc_required=1');
    render(<CookieBannerSection />);
    const banner = screen.getByTestId('cookie-banner');
    expect(banner).toBeInTheDocument();
    // Floating positioning (not inset-x-0)
    expect(banner.className).toContain('fixed');
    expect(banner.className).toContain('bottom-4');
    expect(banner.className).toContain('right-4');
    expect(banner.className).toContain('max-w-[340px]');
    // Inner card surface matching upgrade compact + floating
    const card = banner.firstChild as HTMLElement;
    expect(card.className).toContain('rounded-[18px]');
    expect(card.className).toContain('border-(--linear-app-frame-seam)');
    expect(card.className).toContain('bg-surface-1');
    expect(card.className).toContain('shadow-card');
    // Compact actions always visible (no mobile Manage toggle)
    expect(
      screen.queryByRole('button', { name: /manage/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /accept all/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /customize/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    // Privacy link present (condensed legal text)
    expect(banner.textContent).toContain('essential functionality');
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });

  it('publishes --cookie-banner-h CSS var from measured floating card height (for toasts + profile shells)', async () => {
    setCookie('jv_cc_required=1');
    render(<CookieBannerSection />);
    // The ResizeObserver effect in Section sets the var from data-testid rect
    await vi.waitFor(() => {
      const h =
        document.documentElement.style.getPropertyValue('--cookie-banner-h');
      // Non-empty when visible (exact px depends on jsdom layout, but presence + numeric)
      expect(h).toMatch(/^\d/);
    });
  });

  it('does not render Manage toggle or full bar chrome in floating card mode', () => {
    setCookie('jv_cc_required=1');
    render(<CookieBannerSection />);
    expect(screen.queryByText(/manage/i)).not.toBeInTheDocument();
    const banner = screen.getByTestId('cookie-banner');
    // No old full-width specific classes
    expect(banner.className).not.toContain('inset-x-0');
    expect(banner.className).not.toContain('backdrop-blur-md');
  });
});
