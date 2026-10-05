// Homepage anatomy contract: renders the real `/` layout and page together
// and fails when a required section of the canonical homepage goes missing.
// Required, in order: header, claim hero, product sections, claim close,
// full footer. The logo strip is required exactly when permissioned,
// audience-neutral logo proof exists, and is never rendered without it.
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageIdentityFaq } from '@/components/homepage/HomepageIdentityFaq';
import {
  HOMEPAGE_LOGO_PLACEMENT,
  HomepageLogoStrip,
} from '@/components/homepage/HomepageLogoStrip';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { permittedLogoAssetIds } from '@/data/product-truth/logo-permissions';

vi.mock('@/lib/flags/homepage-v3', () => ({ HOMEPAGE_V3_ENABLED: true }));
vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, quality, unoptimized, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void unoptimized;
    return <img alt='' {...rest} />;
  },
}));

async function renderHomeRoute() {
  const { default: HomeLayout } = await import('@/app/(home)/layout');
  const { default: HomePage } = await import('@/app/(home)/page');
  const page = await HomePage();
  return render(<HomeLayout>{page}</HomeLayout>);
}

/** Position of a node in document order, for ordering assertions. */
function order(container: HTMLElement, node: Element): number {
  return [...container.querySelectorAll('*')].indexOf(node);
}

const PERMISSIONED_HOMEPAGE_LOGOS = permittedLogoAssetIds(
  HOMEPAGE_LOGO_PLACEMENT
);

describe('homepage anatomy contract', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('mounts every required section in order', async () => {
    const { container } = await renderHomeRoute();

    const header = container.querySelector('header');
    const hero = screen.getByTestId('marketing-section-hero');
    const products = screen.getAllByTestId('marketing-section-feature-split');
    const close = screen.getByTestId('marketing-section-cta');
    const footer = screen.getByTestId('marketing-footer');

    expect(header, 'header').not.toBeNull();
    expect(products.length, 'product sections').toBeGreaterThanOrEqual(2);

    const sequence = [header!, hero, ...products, close, footer].map(node =>
      order(container, node)
    );
    expect(sequence).toEqual([...sequence].sort((a, b) => a - b));

    // Hero and close carry the one jov.ie/you claim action.
    expect(within(hero).getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const region of [hero, close]) {
      expect(within(region).getByRole('textbox')).toHaveAttribute(
        'placeholder',
        HOMEPAGE_IDENTITY_COPY.hero.claim.placeholder
      );
    }

    // Removing the FAQ also removes its schema and leaves no empty slot.
    expect(screen.queryByTestId('marketing-section-faq')).toBeNull();
    const structure = container.querySelector(
      '[data-homepage-testid="homepage-section-structure"]'
    );
    expect(structure).not.toBeNull();
    expect(structure?.nextElementSibling).toBe(close);
    const schemas = [
      ...container.querySelectorAll('script[type="application/ld+json"]'),
    ].map(node => JSON.parse(node.textContent ?? '{}') as { '@type'?: string });
    expect(schemas.map(schema => schema['@type'])).toEqual([
      'WebSite',
      'SoftwareApplication',
      'Organization',
    ]);

    // The full SEO footer, never the minimal one.
    expect(footer).not.toHaveClass('system-b-mounted-home-footer');
    expect(within(footer).getAllByRole('link').length).toBeGreaterThan(8);
  });

  it('shows the logo strip only with an active permission covering /', async () => {
    const { container } = await renderHomeRoute();
    const strip = container.querySelector(
      '[data-homepage-testid="homepage-logo-strip"]'
    );

    if (PERMISSIONED_HOMEPAGE_LOGOS.length === 0) {
      // No grants cover `/`: no strip, and no unpermissioned marks.
      expect(strip).toBeNull();
      expect(screen.queryByTestId('marketing-section-logo-cloud')).toBeNull();
      expect(screen.queryByTestId('homepage-trust')).toBeNull();
      return;
    }

    expect(
      strip,
      'permissioned logos exist, so the strip is required'
    ).not.toBeNull();
    const hero = screen.getByTestId('marketing-section-hero');
    const [firstProduct] = screen.getAllByTestId(
      'marketing-section-feature-split'
    );
    expect(order(container, hero)).toBeLessThan(order(container, strip!));
    expect(order(container, strip!)).toBeLessThan(
      order(container, firstProduct)
    );
  });

  it('renders nothing when no permission covers the homepage', () => {
    if (PERMISSIONED_HOMEPAGE_LOGOS.length > 0) return;
    const { container } = render(<HomepageLogoStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the FAQ as a bounded disclosure list from the homepage copy', () => {
    render(<HomepageIdentityFaq />);
    const faq = screen.getByTestId('marketing-section-faq');
    expect(faq).toHaveAttribute(
      'data-marketing-variant',
      'structured-data-list'
    );
    expect(
      within(faq).getByRole('heading', {
        level: 2,
        name: HOMEPAGE_IDENTITY_COPY.faq.heading,
      })
    ).toBeInTheDocument();
    expect(within(faq).getAllByRole('button')).toHaveLength(
      HOMEPAGE_IDENTITY_COPY.faq.items.length
    );
  });
});
