import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingHeader } from '@/components/site/MarketingHeader';

vi.mock('@/components/molecules/MobileNav', () => ({
  MobileNav: () => <button type='button'>Open menu</button>,
}));

describe('MarketingHeader', () => {
  it('renders the shared public nav map', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    expect(screen.getByRole('link', { name: 'Solutions' })).toHaveAttribute(
      'href',
      '/artist-notifications'
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByRole('link', { name: 'Resources' })).toHaveAttribute(
      'href',
      '/blog'
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  it('preserves the homepage single-auth behavior', () => {
    render(<MarketingHeader variant='homepage' />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(
      screen.queryByRole('link', { name: 'Log in' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Start Free Trial' })
    ).not.toBeInTheDocument();
  });
});
