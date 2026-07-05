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

  it('renders the full marketing footer by default on marketing pages', () => {
    render(<MarketingFooter />);

    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    expect(screen.getByRole('link', { name: 'Investors' })).toHaveAttribute(
      'href',
      '/investors'
    );
    expect(screen.getByRole('link', { name: 'Status' })).toHaveAttribute(
      'href',
      'https://status.jov.ie'
    );
  });

  it('renders the full homepage footer without the duplicate final CTA', () => {
    mockUsePathname.mockReturnValue('/');

    render(<MarketingFooter />);

    expect(
      screen.queryByTestId('marketing-footer-cta')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Built for artists. By artists.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Connect' })
    ).not.toBeInTheDocument();
  });

  it('honors the expanded footer variant when the full-footer flag is enabled by default', () => {
    render(<MarketingFooter variant='expanded' />);

    expect(screen.getByTestId('marketing-footer-cta')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Product' })).toBeVisible();
  });
});
