import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.queryByRole('link', { name: 'About' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'For Artists' })).toBeNull();
    expect(screen.getByRole('button', { name: /Customers/ })).toHaveAttribute(
      'aria-expanded',
      'false'
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

  it('orders Customers, Product, and Pricing after the wordmark', () => {
    render(<MarketingHeader />);

    const navItems = Array.from(
      document.querySelector('.marketing-glass-header__nav')?.children ?? []
    ).map(item => item.textContent);

    expect(navItems).toEqual(['Jovie', 'Customers', 'Product', 'Pricing']);
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
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resources/ })).toBeNull();
  });

  it('opens the compact Customers flyout with only audiences that have a page', () => {
    render(<MarketingHeader />);

    const trigger = screen.getByRole('button', { name: /Customers/ });
    fireEvent.focus(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const flyout = document.getElementById('marketing-header-flyout-customers');
    expect(flyout).toHaveClass('marketing-glass-header__flyout--compact');
    expect(flyout).toHaveTextContent('Customers');
    const links = within(flyout as HTMLElement).getAllByRole('link');
    expect(
      links.map(link => [link.textContent, link.getAttribute('href')])
    ).toEqual([['Artists', '/solutions/artists']]);
    for (const absent of ['Founders', 'Authors', 'Creators', 'Investors']) {
      expect(within(flyout as HTMLElement).queryByText(absent)).toBeNull();
    }
    expect(
      flyout?.querySelectorAll('.marketing-glass-header__flyout-arrow')
    ).toHaveLength(1);
    expect(
      flyout?.querySelectorAll('.marketing-glass-header__flyout-description')
    ).toHaveLength(0);
  });

  it('uses the one Find yourself CTA on the homepage header (JOV-5085)', () => {
    mockUsePathname.mockReturnValue('/');
    render(<MarketingHeader />);

    const ctas = screen.getAllByRole('link', { name: 'Find yourself' });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute('href', '/start');
    }
    expect(screen.queryByRole('link', { name: 'Request access' })).toBeNull();
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
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    expect(screen.getByRole('link', { name: 'Find yourself' })).toHaveAttribute(
      'href',
      '/start'
    );
  });

  it('docks with no glass at the top and fades it in once the sentinel scrolls away', () => {
    mockUsePathname.mockReturnValue('/artist-profiles');
    const observers: {
      callback: IntersectionObserverCallback;
      observed: Element[];
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observed: Element[] = [];
        disconnect = vi.fn();
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe(element: Element) {
          this.observed.push(element);
        }
        unobserve() {}
        takeRecords() {
          return [];
        }
      }
    );
    try {
      const { unmount } = render(<MarketingHeader />);
      const header = screen.getByTestId('header-nav');
      const sentinel = screen.getByTestId('header-nav-scroll-sentinel');

      expect(header).toHaveClass('header-nav--docked');
      expect(header).not.toHaveAttribute('data-scrolled');
      expect(sentinel).toHaveAttribute('aria-hidden', 'true');

      const observer = observers.find(item => item.observed.includes(sentinel));
      if (!observer) throw new Error('Sentinel must be observed');
      const fire = (isIntersecting: boolean) =>
        act(() => {
          observer.callback(
            [{ isIntersecting } as IntersectionObserverEntry],
            {} as IntersectionObserver
          );
        });

      fire(false);
      expect(header).toHaveAttribute('data-scrolled', 'true');
      fire(true);
      expect(header).not.toHaveAttribute('data-scrolled');

      unmount();
      expect(observer.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the desktop wordmark lockup by default and marks it for the reveal guard', () => {
    render(<MarketingHeader />);

    expect(screen.getByTestId('header-nav')).toHaveAttribute(
      'data-brand-lockup',
      'desktop'
    );
    expect(screen.getByTestId('site-logo-link')).toHaveAttribute(
      'data-logo-reveal',
      'true'
    );
  });

  it('goes icon-only when the page hero already names Jovie', () => {
    mockUsePathname.mockReturnValue('/download');

    render(<MarketingHeader />);

    const header = screen.getByTestId('header-nav');
    expect(
      document.querySelector('.marketing-glass-header__brand-wordmark')
    ).toBeNull();
    expect(header).not.toHaveAttribute('data-brand-lockup');
    const logoLink = screen.getByTestId('site-logo-link');
    expect(logoLink).toHaveClass('logo-reveal');
    expect(logoLink).toHaveAccessibleName('Jovie');
    expect(screen.getByTestId('logo-reveal-mark')).toContainElement(
      logoLink.querySelector('[data-brand-variant="jovie"]') as HTMLElement
    );
    const wordmark = screen.getByTestId('logo-reveal-wordmark');
    expect(wordmark).toHaveTextContent('Jovie');
    expect(wordmark).toHaveAttribute('aria-hidden', 'true');
    expect(wordmark).toHaveClass('logo-reveal__wordmark');
  });

  it('lets a page force the brand presentation explicitly', () => {
    render(<MarketingHeader brand='icon' />);

    expect(
      document.querySelector('.marketing-glass-header__brand-wordmark')
    ).toBeNull();
    expect(screen.getByTestId('site-logo-link')).toHaveClass('logo-reveal');
  });

  it('renders explicit custom nav links when the shared nav flag is enabled', () => {
    render(
      <MarketingHeader
        navLinks={[
          { href: '/artist-profiles', label: 'For Artists' },
          { href: '/pricing', label: 'Pricing' },
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /For/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tools/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'For Artists' })).toHaveAttribute(
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
