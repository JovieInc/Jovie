import { render, screen } from '@testing-library/react';
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

  it('renders the shared default marketing navigation on standard routes', () => {
    render(<MarketingHeader />);

    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    expect(screen.getByRole('link', { name: 'Solutions' })).toHaveAttribute(
      'href',
      '/artist-notifications'
    );
    expect(screen.getByRole('link', { name: 'Resources' })).toHaveAttribute(
      'href',
      '/blog'
    );
  });

  it('preserves the staged nav on /new', () => {
    mockUsePathname.mockReturnValue('/new');

    render(<MarketingHeader />);

    expect(
      screen.getByRole('link', { name: 'Artist Profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      '/support'
    );
    expect(
      screen.queryByRole('link', { name: 'Product' })
    ).not.toBeInTheDocument();
  });
});
