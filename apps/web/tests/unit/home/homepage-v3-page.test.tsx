// The active / route is locked to the YouTube artist MVP, including before access opens.
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageYoutubeMvp } from '@/components/homepage/HomepageYoutubeMvp';
import { HOMEPAGE_YOUTUBE_MVP as copy } from '@/data/homepageYoutubeMvp';
import {
  getMarketingRecipe,
  getRouteRecipeParity,
  MARKETING_ROUTE_MANIFEST,
  MarketingBriefSchema,
  resolveComposition,
} from '@/data/marketing';
import { PRODUCT_CAPABILITIES } from '@/data/product-truth/registry';

const flags = vi.hoisted(() => ({
  HOMEPAGE_V3_ENABLED: true,
  WAITLIST_ENABLED: true,
}));
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    FEATURE_FLAGS: {
      ...original.FEATURE_FLAGS,
      get WAITLIST_ENABLED() {
        return flags.WAITLIST_ENABLED;
      },
    },
  };
});
vi.mock('@/lib/flags/homepage-v3', () => ({
  get HOMEPAGE_V3_ENABLED() {
    return flags.HOMEPAGE_V3_ENABLED;
  },
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: vi.fn(),
}));
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  }),
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

async function renderHomePage() {
  const { default: HomePage } = await import('@/app/(home)/page');
  return render(await HomePage());
}

describe('YouTube artist MVP page composition', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('links the founder story from the real homepage composition', () => {
    render(<HomepageYoutubeMvp />);
    expect(
      screen.getByRole('link', { name: 'Read the story' })
    ).toHaveAttribute('href', '/about');
  });

  it.each([true, false])(
    'keeps the upload loop and Find me with waitlist=%s',
    async waitlist => {
      flags.WAITLIST_ENABLED = waitlist;
      const { container } = await renderHomePage();

      const ids = [...container.querySelectorAll('[data-homepage-testid]')]
        .map(section => section.getAttribute('data-homepage-testid'))
        .filter(id => !id?.startsWith('homepage-possibility-'));
      expect(ids).toEqual(['homepage-hero-shell', 'homepage-close']);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Every upload, a release.',
        })
      ).toBeInTheDocument();

      expect(screen.queryByTestId('marketing-section-faq')).toBeNull();

      // Bind the manifest to the mounted sections, rather than the available
      // copy fields (FAQ copy can exist without mounting a FAQ).
      const mountedSectionIds = [
        ...container.querySelectorAll(
          'section[data-testid^="marketing-section-"]'
        ),
      ].map(section =>
        section.getAttribute('data-testid')?.replace('marketing-section-', '')
      );
      const entry = MARKETING_ROUTE_MANIFEST.find(route => route.url === '/')!;
      expect(getRouteRecipeParity(entry).actualSectionIds).toEqual(
        mountedSectionIds
      );

      // Find me hands off to /start; auth owns access eligibility.
      const hero = screen.getByTestId('marketing-section-hero');
      const close = screen.getByTestId('marketing-section-cta');
      for (const region of [hero, close]) {
        expect(within(region).getByRole('combobox')).toHaveAttribute(
          'placeholder',
          copy.search.placeholder
        );
        expect(
          within(region).getByRole('button', { name: 'Find me' })
        ).toBeVisible();
        expect(within(region).queryAllByRole('link')).toHaveLength(0);
        expect(
          within(region).queryByText('Request access')
        ).not.toBeInTheDocument();
      }

      expect(screen.queryByText(/Drop more music/i)).toBeNull();
      const proof = screen.getByTestId('marketing-section-social-proof');
      expect(proof).toHaveTextContent("BUILT BY PEOPLE WHO'VE CREATED FOR");
      expect(
        container
          .querySelector('[data-capability-id="smart-links"]')
          ?.compareDocumentPosition(proof)
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        container.querySelector('[data-homepage-variant]')
      ).toHaveAttribute('data-homepage-variant', copy.variantIdentity);
    }
  );

  it('resolves the artist homepage brief to the same sections before auth', () => {
    const brief = MarketingBriefSchema.parse({
      businessObjective:
        'Turn regular YouTube uploads into releases and reachable fans',
      targetAudience: 'artist',
      desiredConversion: 'start',
      trafficSource: 'home',
      intent: 'category',
      availableAssets: { logoCloudVerified: false, socialProofVerified: true },
      brandConstraints: { waitlistEnabled: true },
    });
    const composition = resolveComposition(brief);
    const recipe = getMarketingRecipe(composition.recipeId);
    const entry = MARKETING_ROUTE_MANIFEST.find(route => route.url === '/')!;

    expect(recipe.referenceRoute).toBe('/');
    expect(recipe.hierarchy.oneBigIdea).toBe(copy.hero.subhead);
    expect(composition.sections.map(section => section.sectionId)).toEqual([
      'hero',
      ...copy.features.map(() => 'feature-split'),
      'spec-wall',
      'social-proof',
      'pricing',
      'cta',
    ]);
    expect(composition.primaryCtaLabel).toBe(copy.search.action);
    expect(composition.secondaryCtaLabel).toBeUndefined();
    expect(getRouteRecipeParity(entry).matches).toBe(true);
  });

  it('limits the advertised loop to public, proof-authorized capabilities', async () => {
    await renderHomePage();
    expect(copy.surfaces.map(surface => surface.id).sort()).toEqual([
      'public-profile',
      'release-launch',
      'smart-links',
      'youtube-thumbnails',
    ]);
    for (const surface of copy.surfaces) {
      expect(PRODUCT_CAPABILITIES[surface.id].publication).toBe('public');
      expect(PRODUCT_CAPABILITIES[surface.id].marketing.proofAuthorized).toBe(
        true
      );
      expect(
        screen
          .getAllByRole('link', { name: surface.label })
          .some(link => link.getAttribute('href') === surface.href)
      ).toBe(true);
    }
    const { generateMetadata } = await import('@/app/(home)/page');
    expect(await generateMetadata()).toMatchObject({
      title: { absolute: copy.seo.title },
      description: copy.seo.description,
    });
  });
});
