import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('renders the shared glass marketing navigation on standard routes', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('button', { name: /Features/ })).toHaveAttribute(
      'aria-controls',
      'marketing-header-flyout-features'
    );
    expect(screen.getByRole('button', { name: /Resources/ })).toHaveAttribute(
      'aria-controls',
      'marketing-header-flyout-resources'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/support'
    );
  });

  it('removes hidden flyout links from the tab order until opened', () => {
    const { container } = render(<MarketingHeader />);
    const featuresTrigger = screen.getByRole('button', { name: /Features/ });
    const featuresFlyout = container.querySelector(
      '#marketing-header-flyout-features'
    );
    const resourcesFlyout = container.querySelector(
      '#marketing-header-flyout-resources'
    );

    expect(featuresFlyout).toHaveAttribute('aria-hidden', 'true');
    expect(featuresFlyout).toHaveAttribute('inert');
    expect(resourcesFlyout).toHaveAttribute('aria-hidden', 'true');
    expect(resourcesFlyout).toHaveAttribute('inert');

    fireEvent.mouseEnter(featuresTrigger);

    expect(featuresFlyout).toHaveAttribute('aria-hidden', 'false');
    expect(featuresFlyout).not.toHaveAttribute('inert');
    expect(resourcesFlyout).toHaveAttribute('aria-hidden', 'true');
    expect(resourcesFlyout).toHaveAttribute('inert');
  });

  it('renders explicit custom nav links consistently as simple glass links', () => {
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
  });
});
