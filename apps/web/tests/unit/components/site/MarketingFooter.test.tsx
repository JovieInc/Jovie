import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingFooter } from '@/components/site/MarketingFooter';

let mockPathname = '/support';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('MarketingFooter', () => {
  beforeEach(() => {
    mockPathname = '/support';
  });

  it('renders the locked CTA before the grouped footer links', () => {
    render(<MarketingFooter variant='expanded' />);

    const cta = screen.getByTestId('homepage-v2-final-cta');
    const footerNav = screen.getByRole('navigation', { name: 'Footer' });

    expect(cta).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-final-cta-heading')
    ).toHaveTextContent(/Start using Jovie\s*today for free\./);
    expect(cta.compareDocumentPosition(footerNav)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getByRole('heading', { name: 'Product' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Connect' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Release System' })
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });

  it('does not duplicate the CTA on pages that own their final CTA', () => {
    mockPathname = '/artist-profiles';

    render(<MarketingFooter variant='expanded' />);

    expect(
      screen.queryByTestId('homepage-v2-final-cta')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeVisible();
  });

  it('does not duplicate the CTA on the homepage legal footer', () => {
    mockPathname = '/';

    render(<MarketingFooter variant='expanded' />);

    expect(
      screen.queryByTestId('homepage-v2-final-cta')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeVisible();
  });
});
