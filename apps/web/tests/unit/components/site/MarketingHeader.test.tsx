import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderNav } from '@/components/organisms/HeaderNav';
import { MarketingHeader } from '@/components/site/MarketingHeader';

const mockUsePathname = vi.fn<string | null, []>(() => '/about');

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => mockUsePathname(),
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
    mockUsePathname.mockReturnValue('/about');
  });

  it('renders marketing center navigation when the center-nav flag is enabled', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('button', { name: /Features/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Resources/ })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/support'
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  it('shows flyout menu triggers when center navigation is enabled', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('button', { name: /Features/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Resources/ })).toBeVisible();
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

    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
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
      screen.getByRole('link', { name: 'Sign in' }).parentElement?.parentElement
    ).toHaveClass('hidden', 'md:flex');
  });
});
