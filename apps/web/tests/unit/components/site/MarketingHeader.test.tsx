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

describe('MarketingHeader', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/about');
  });

  it('renders only logo and auth actions by default on standard routes', () => {
    render(<MarketingHeader />);

    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resources/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Contact' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  it('does not mount flyout menus when center navigation is disabled', () => {
    const { container } = render(<MarketingHeader />);
    const featuresFlyout = container.querySelector(
      '#marketing-header-flyout-features'
    );
    const resourcesFlyout = container.querySelector(
      '#marketing-header-flyout-resources'
    );

    expect(featuresFlyout).toBeNull();
    expect(resourcesFlyout).toBeNull();
  });

  it('keeps explicit custom nav links hidden until the shared nav flag is enabled', () => {
    render(
      <MarketingHeader
        navLinks={[
          { href: '/artist-profiles', label: 'Product' },
          { href: '/pricing', label: 'Pricing' },
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /Features/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Product' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
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
