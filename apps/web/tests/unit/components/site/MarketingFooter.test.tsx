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

  it('renders the footer CTA on pages that do not own a final CTA', () => {
    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Investors' })).toHaveAttribute(
      'href',
      '/investors'
    );
    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute(
      'href',
      'https://status.jov.ie'
    );
  });

  it('hides the footer CTA on homepage-owned CTA routes', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });

  it('uses the minimal footer on pricing', () => {
    mockUsePathname.mockReturnValue('/pricing');

    render(<MarketingFooter />);

    expect(
      screen.queryByRole('heading', { name: 'Product' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
  });
});
