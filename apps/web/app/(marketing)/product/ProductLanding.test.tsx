import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { buildClaimProfileStartHref } from '@/data/marketingCtaIntents';
import { PRODUCT_COPY } from '@/data/productCopy';
import { ProductLanding } from './ProductLanding';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

describe('ProductLanding locked hero (DESIGN_READY 2026-09-17)', () => {
  beforeEach(() => {
    mocks.push.mockReset();
  });

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
    expect(cta).toHaveAttribute('type', 'submit');
    expect(cta).toHaveAttribute('data-primary-action', 'true');
    expect(
      screen.getByRole('textbox', { name: 'Choose Your Handle' })
    ).toHaveAttribute('placeholder', 'you');
  });

  it('preserves an entered handle in the canonical claim intent', () => {
    render(<ProductLanding />);

    const input = screen.getByRole('textbox', { name: 'Choose Your Handle' });
    fireEvent.change(input, { target: { value: 'fresh-handle' } });
    fireEvent.submit(screen.getByTestId('product-claim-form'));

    expect(mocks.push).toHaveBeenCalledWith(
      buildClaimProfileStartHref('fresh-handle')
    );
  });

  it('keeps an empty claim safe and focused', () => {
    render(<ProductLanding />);

    const input = screen.getByRole('textbox', { name: 'Choose Your Handle' });
    fireEvent.click(screen.getByTestId('product-claim-cta'));

    expect(input).toHaveFocus();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps the claim handle keyboard focus visible', () => {
    render(<ProductLanding />);

    expect(
      screen.getByRole('textbox', { name: 'Choose Your Handle' })
    ).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:border-focus',
      'focus-visible:ring-2',
      'focus-visible:ring-focus/25',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-surface-page'
    );
  });

  it('keeps invalid handles local instead of navigating', () => {
    render(<ProductLanding />);

    const input = screen.getByRole('textbox', { name: 'Choose Your Handle' });
    fireEvent.change(input, { target: { value: 'bad handle' } });
    fireEvent.submit(screen.getByTestId('product-claim-form'));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-handle-status')).toHaveTextContent(
      'Handle can only contain lowercase letters, numbers, and hyphens'
    );
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
