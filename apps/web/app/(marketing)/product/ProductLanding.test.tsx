import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { PRODUCT_CLAIM_HREF, PRODUCT_COPY } from '@/data/productCopy';
import { ProductLanding } from './ProductLanding';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ProductLanding locked hero (DESIGN_READY 2026-09-17)', () => {
  it('renders the locked left copy and claim-card proof', () => {
    render(<ProductLanding />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(screen.getByText(PRODUCT_COPY.hero.kicker)).toBeVisible();
    expect(screen.getByTestId('product-hero-heading')).toHaveTextContent(
      PRODUCT_COPY.hero.headline
    );
    expect(screen.getByText(PRODUCT_COPY.hero.support)).toBeVisible();

    const card = screen.getByTestId('product-claim-card');
    expect(card).toBeVisible();
    expect(card).toHaveTextContent(PRODUCT_COPY.claimCard.status);
    expect(card).toHaveTextContent(PRODUCT_COPY.claimCard.pathLabel);
    expect(card).toHaveTextContent(PRODUCT_COPY.claimCard.outcome);
    expect(card).toHaveTextContent(PRODUCT_COPY.claimCard.proof);

    const cta = screen.getByTestId('product-claim-cta');
    expect(cta).toHaveTextContent(PRODUCT_COPY.claimCard.cta);
    expect(cta).toHaveAttribute('href', PRODUCT_CLAIM_HREF);
    expect(cta).toHaveAttribute('data-primary-action', 'true');
  });

  it('keeps the homepage hero H1 on the homepage, not /product', () => {
    render(<ProductLanding />);

    expect(HOMEPAGE_LAUNCH_COPY.hero.headline).toBe(
      'Control how the world sees you.'
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Be found. Be understood.'
    );
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: 'Control how the world sees you.',
      })
    ).toBeNull();
  });

  it('does not render a browser chrome bar or a full-width Claim artist profile button', () => {
    render(<ProductLanding />);

    expect(screen.queryByText('Claim artist profile')).toBeNull();
    expect(screen.queryByText(/address bar/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Claim artist profile' })
    ).toBeNull();
    expect(
      screen
        .getByTestId('product-claim-card')
        .querySelector('[data-testid="product-claim-cta"]')
    ).not.toBeNull();
  });
});
