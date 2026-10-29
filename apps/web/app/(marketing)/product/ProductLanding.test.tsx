import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
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

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void priority;
    void quality;
    return <img alt='' {...rest} />;
  },
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
    expect(screen.getByTestId('product-hero-heading')).toHaveTextContent(
      PRODUCT_COPY.hero.headline
    );
    expect(screen.getByText(PRODUCT_COPY.hero.support)).toBeVisible();

    const card = screen.getByTestId('product-claim-card');
    expect(card).toBeVisible();
    expect(card).toHaveTextContent(PRODUCT_COPY.claimCard.proof);

    const cta = screen.getByTestId('product-claim-cta');
    expect(cta).toHaveTextContent(PRODUCT_COPY.claimCard.cta);
    expect(cta).toHaveAttribute('type', 'submit');
    expect(cta).toHaveAttribute('data-primary-action', 'true');
    expect(
      within(screen.getByTestId('product-claim-card')).getByRole('textbox', {
        name: 'Choose Your Handle',
      })
    ).toHaveAttribute('placeholder', 'you');
  });

  it('preserves an entered handle in the canonical claim intent', () => {
    render(<ProductLanding />);

    const input = within(screen.getByTestId('product-claim-card')).getByRole(
      'textbox',
      { name: 'Choose Your Handle' }
    );
    fireEvent.change(input, { target: { value: 'fresh-handle' } });
    fireEvent.submit(screen.getByTestId('product-claim-form'));

    expect(mocks.push).toHaveBeenCalledWith(
      buildClaimProfileStartHref('fresh-handle')
    );
  });

  it('keeps an empty claim safe and focused', () => {
    render(<ProductLanding />);

    const input = within(screen.getByTestId('product-claim-card')).getByRole(
      'textbox',
      { name: 'Choose Your Handle' }
    );
    fireEvent.click(screen.getByTestId('product-claim-cta'));

    expect(input).toHaveFocus();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps the claim handle keyboard focus visible', () => {
    render(<ProductLanding />);

    // Founder-directed 2026-10-28 (square inner focus ring inside the pill):
    // the CompositeField container owns the pill-shaped focus ring, so the
    // input paints none (no focus-ring-themed, no outline). The locked
    // route-quality focus check accepts the composite ancestor's ring.
    const input = within(screen.getByTestId('product-claim-card')).getByRole(
      'textbox',
      { name: 'Choose Your Handle' }
    );
    expect(input.className).not.toContain('focus-ring-themed');
    expect(input.className).not.toMatch(/focus-visible:outline\b/);
    expect(input.closest('[data-component="composite-field"]')).not.toBeNull();
  });

  it('keeps invalid handles local instead of navigating', () => {
    render(<ProductLanding />);

    const input = within(screen.getByTestId('product-claim-card')).getByRole(
      'textbox',
      { name: 'Choose Your Handle' }
    );
    fireEvent.change(input, { target: { value: 'bad handle' } });
    fireEvent.submit(screen.getByTestId('product-claim-form'));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('product-handle-status')).toHaveTextContent(
      'Handle can only contain lowercase letters, numbers, and hyphens'
    );
  });

  it('keeps the homepage hero H1 on the homepage, not /product', () => {
    render(<ProductLanding />);

    expect(HOMEPAGE_COPY.hero.headline).toBe('Be found. Be understood.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your living identity on the internet.'
    );
    expect(
      screen.queryByRole('heading', {
        level: 1,
        name: HOMEPAGE_COPY.hero.headline,
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

  it('closes with the Pen editorial-search action, not a truncated link button', () => {
    render(<ProductLanding />);

    // JOV-7230: Pen dClrT/DbI9f closes /product on the two-line "See what
    // shows up / when people search for you." headline plus the canonical
    // handle-search action — not a "Claim your Jovie" link button.
    const close = screen.getByTestId('marketing-section-cta');
    expect(close.tagName).toBe('SECTION');
    expect(close).toHaveAttribute('data-marketing-variant', 'editorial-search');

    const scope = within(close);
    expect(
      scope.getByRole('heading', {
        name: 'See what shows up when people search for you.',
      })
    ).toBeVisible();
    expect(
      scope.getByRole('textbox', { name: 'Choose Your Handle' })
    ).toBeInTheDocument();
    expect(
      scope.getByRole('button', { name: PRODUCT_COPY.claimCard.cta })
    ).toBeInTheDocument();
    expect(scope.queryByText('Claim your Jovie')).toBeNull();
  });
});

describe('ProductLanding explore links', () => {
  it('links every product page that is not in the footer', async () => {
    const { PRODUCT_EXPLORE_GROUPS } = await import(
      '@/data/productExploreLinks'
    );
    render(<ProductLanding />);
    const section = screen.getByTestId('product-explore-links');
    const hrefs = within(section)
      .getAllByRole('link')
      .map(link => link.getAttribute('href'));
    expect(hrefs).toEqual(
      PRODUCT_EXPLORE_GROUPS.flatMap(group => group.links.map(l => l.href))
    );
    for (const href of [
      '/product/isrc',
      '/product/utm-links',
      '/product/dsp-links',
      '/product/command-palette',
      '/product/release-scheduling',
      '/solutions/artists',
      '/launch',
      '/compare',
      '/alternatives',
      '/engineering',
    ]) {
      expect(hrefs).toContain(href);
    }
  });
});
