import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingFooter } from '@/components/site/MarketingFooter';

const mockUsePathname = vi.fn<string | null, []>(() => '/about');

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    usePathname: () => mockUsePathname(),
  };
});

describe('MarketingFooter', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/about');
  });

  it('renders a legal-only footer by default on marketing pages', () => {
    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    expect(screen.queryByRole('link', { name: 'Investors' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Status' })).toBeNull();
  });

  it('keeps homepage footer legal-only', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Built for artists. By artists.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Connect' })
    ).not.toBeInTheDocument();
  });

  it('does not expand the footer unless the full-footer flag is enabled', () => {
    render(<MarketingFooter variant='expanded' />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Product' })).toBeNull();
  });
});
