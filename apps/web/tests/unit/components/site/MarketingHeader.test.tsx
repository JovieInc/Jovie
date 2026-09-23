import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import {
  CANONICAL_PUBLIC_SHELL_CONTEXT,
  CANONICAL_PUBLIC_SHELL_EVENTS,
} from '@/data/canonicalPublicShellOptimization';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';

const mockUsePathname = vi.fn<() => string | null>(() => '/about');
const mockTrack = vi.fn();

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => mockUsePathname(),
  };
});

vi.mock('@/lib/analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/analytics')>();
  return {
    ...actual,
    track: (...args: unknown[]) => mockTrack(...args),
  };
});

// Product default: SHOW_MARKETING_CENTER_NAV is false (clean homepage baseline).
// Enable it here so header content assertions exercise center nav in isolation.
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_MARKETING_CENTER_NAV: true,
      SHOW_HOMEPAGE_CENTER_NAV: true,
    },
  };
});

describe('MarketingHeader', () => {
  beforeEach(() => {
    mockTrack.mockClear();
    mockUsePathname.mockReturnValue('/about');
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
  });

  it('reserves only enlarged row growth and releases its observer on unmount', () => {
    const observations: {
      element: Element;
      resize: () => void;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        resize: () => void;
        disconnect = vi.fn();
        constructor(resize: () => void) {
          this.resize = resize;
        }
        observe(element: Element) {
          observations.push({
            element,
            resize: this.resize,
            disconnect: this.disconnect,
          });
        }
        unobserve() {}
      }
    );
    try {
      const view = render(<MarketingHeader />);
      const space = view.container.querySelector(
        '.marketing-header-growth-space'
      );
      const row = view.container.querySelector(
        '.marketing-glass-header__shell'
      )?.firstElementChild;
      expect(space).not.toBeNull();
      expect(row).toBeInstanceOf(HTMLElement);
      if (!(row instanceof HTMLElement) || !(space instanceof HTMLElement))
        throw new Error('Missing header geometry');
      row.style.minHeight = '44px';
      const bounds = vi.spyOn(row, 'getBoundingClientRect');
      const observation = observations.find(item => item.element === row);
      if (!observation) throw new Error('Header row must be observed');
      bounds.mockReturnValue(new DOMRect(0, 0, 1024, 44));
      observation.resize();
      expect(space.style.height).toBe('0px');
      bounds.mockReturnValue(new DOMRect(0, 0, 1024, 100));
      observation.resize();
      expect(space.style.height).toBe('56px');
      bounds.mockReturnValue(new DOMRect(0, 0, 1024, 44));
      observation.resize();
      expect(space.style.height).toBe('0px');
      view.unmount();
      expect(observation.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fires one canonical public-shell exposure receipt', () => {
    render(<MarketingHeader />);

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith(
      CANONICAL_PUBLIC_SHELL_EVENTS.EXPOSURE,
      CANONICAL_PUBLIC_SHELL_CONTEXT
    );
  });

  it('renders the canonical public navigation when the center-nav flag is enabled', () => {
    render(<MarketingHeader />);

    expect(screen.getByTestId('header-nav')).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.shell.header
    );
    expect(MARKETING_PEN_CONTRACT_IDS.shell.header).toBe('GTcgO');
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute(
      'href',
      '/artists'
    );
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.queryByRole('button', { name: /For/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resources/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    // The shared public CTA follows the waitlist-on front-door contract on /signup.
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');
  });

  it('shows canonical desktop links instead of flyout menu triggers', () => {
    render(<MarketingHeader />);

    const navItems = Array.from(
      document.querySelector('.marketing-glass-header__nav')?.children ?? []
    ).map(item => item.textContent);

    expect(navItems).toEqual(['Jovie', 'Artists', 'Product', 'Pricing']);
    expect(
      document.querySelector(
        '.marketing-glass-header__nav .marketing-glass-header__brand-wordmark'
      )
    ).toHaveTextContent('Jovie');
    expect(
      screen
        .getByTestId('site-logo-link')
        .querySelector('[data-brand-variant="jovie"]')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /For/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resources/ })).toBeNull();
  });

  it('scopes homepage-style header overrides to the artist-profiles route', () => {
    mockUsePathname.mockReturnValue('/artist-profiles');

    render(<MarketingHeader />);

    expect(screen.getByTestId('header-nav')).toHaveClass(
      'artist-profiles-home-header'
    );
    expect(screen.getByTestId('header-nav')).toHaveAttribute(
      'data-presentation',
      'marketing-glass'
    );
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  it('keeps the legacy artist-profile alias on the same shared chrome', () => {
    mockUsePathname.mockReturnValue('/artist-profile');

    render(<MarketingHeader />);

    expect(screen.getByTestId('header-nav')).toHaveClass(
      'artist-profiles-home-header'
    );
  });

  it('does not leak artist-profile header overrides onto the homepage', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingHeader variant='homepage' />);

    expect(screen.getByTestId('header-nav')).not.toHaveClass(
      'artist-profiles-home-header'
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute(
      'href',
      '/artists'
    );
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');
  });

  it('applies and cleans up homepage-style scroll treatment', () => {
    mockUsePathname.mockReturnValue('/artist-profiles');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<MarketingHeader />);
    const header = screen.getByTestId('header-nav');

    expect(header).not.toHaveAttribute('data-scrolled');

    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 24,
    });
    fireEvent.scroll(window);

    expect(header).toHaveAttribute('data-scrolled', 'true');

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function)
    );
    removeEventListener.mockRestore();
  });

  it('renders explicit custom nav links when the shared nav flag is enabled', () => {
    render(
      <MarketingHeader
        navLinks={[
          { href: '/artist-profiles', label: 'Product' },
          { href: '/pricing', label: 'Pricing' },
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /For/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(
      document.querySelector('.marketing-glass-header__brand-wordmark')
    ).toBeNull();
  });

  it('accepts a page-owned CTA contract without creating a header variant', () => {
    render(
      <MarketingHeader primaryCta={{ href: '/start', label: 'Get started' }} />
    );

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/start'
    );
  });

  it('hides inline glass auth on mobile when a mobile nav is present', () => {
    render(
      <HeaderNav
        authMode='public-static'
        flyoutMenus={[]}
        hideDesktopNav={false}
        mobileNavLinks={[{ href: '/pricing', label: 'Pricing' }]}
        navLinks={[{ href: '/pricing', label: 'Pricing' }]}
        presentation='marketing-glass'
      />
    );

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Log in' }).parentElement?.parentElement
    ).toHaveClass('hidden', 'lg:flex');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(
      screen.getByRole('navigation', { name: 'Mobile Navigation' })
    ).toHaveStyle({
      maxHeight: 'calc(100dvh - env(safe-area-inset-top))',
      overflowY: 'auto',
    });
  });
});
