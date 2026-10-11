// Renders the real `/` page module with the v3 flag pinned on (the default
// since 2026-09-28), then off (rollback), so both compositions stay exact.
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import {
  getMarketingRecipe,
  getRouteRecipeParity,
  MARKETING_ROUTE_MANIFEST,
  MarketingBriefSchema,
  resolveComposition,
} from '@/data/marketing';

const flags = vi.hoisted(() => ({ HOMEPAGE_V3_ENABLED: true }));
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

describe('homepage v3 page composition', { timeout: 60_000 }, () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('mounts the v3 hero, presence, structure, and close without FAQ with the flag on', async () => {
    flags.HOMEPAGE_V3_ENABLED = true;
    const { container } = await renderHomePage();

    const ids = [...container.querySelectorAll('[data-homepage-testid]')]
      .map(section => section.getAttribute('data-homepage-testid'))
      .filter(id => !id?.startsWith('homepage-possibility-'));
    expect(ids).toEqual([
      'homepage-hero-shell',
      'homepage-section-presence',
      'homepage-section-structure',
      'homepage-close',
    ]);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Be found.Be understood.',
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

    // One jov.ie/you claim action in hero and close (Tim 2026-09-28).
    const hero = screen.getByTestId('marketing-section-hero');
    const close = screen.getByTestId('marketing-section-cta');
    for (const region of [hero, close]) {
      expect(within(region).getByRole('textbox')).toHaveAttribute(
        'placeholder',
        'you'
      );
      expect(within(region).queryByText('Search your name')).toBeNull();
      expect(within(region).queryAllByRole('link')).toHaveLength(0);
      expect(
        within(region).queryByText('Request access')
      ).not.toBeInTheDocument();
    }

    // Each background image once, each in its own section.
    const backgrounds = [
      ...container.querySelectorAll('[data-background-image]'),
    ].map(node => node.getAttribute('data-background-image'));
    expect(backgrounds).toEqual([
      '/assets/generated/homepage-presence-satin-v1.webp',
    ]);
    expect(screen.queryByText("What's new in Jovie")).toBeNull();
  });

  it('resolves the general homepage brief to the selected identity structure and action', () => {
    const brief = MarketingBriefSchema.parse({
      businessObjective: 'Help a general visitor claim their public identity',
      targetAudience: 'general',
      desiredConversion: 'claim-handle',
      trafficSource: 'home',
      intent: 'category',
      availableAssets: { logoCloudVerified: false, socialProofVerified: false },
    });
    const composition = resolveComposition(brief);
    const recipe = getMarketingRecipe(composition.recipeId);
    const entry = MARKETING_ROUTE_MANIFEST.find(route => route.url === '/')!;

    expect(recipe.referenceRoute).toBe('/');
    expect(recipe.hierarchy.oneBigIdea).toBe(
      HOMEPAGE_IDENTITY_COPY.hero.subhead
    );
    expect(composition.sections.map(section => section.sectionId)).toEqual([
      'hero',
      ...HOMEPAGE_IDENTITY_COPY.sections.map(() => 'feature-split'),
      'cta',
    ]);
    expect(composition.primaryCtaLabel).toBe(
      HOMEPAGE_IDENTITY_COPY.hero.claim.action
    );
    expect(composition.secondaryCtaLabel).toBeUndefined();
    expect(getRouteRecipeParity(entry).matches).toBe(true);
  });

  it('keeps the live story stack with the flag off', async () => {
    flags.HOMEPAGE_V3_ENABLED = false;
    await renderHomePage();

    // The identity hero stays live; only the v3 body is gated.
    expect(screen.getByTestId('homepage-claim-card')).not.toBeNull();
    expect(screen.getByTestId('homepage-story-stack')).not.toBeNull();
    expect(screen.queryByTestId('homepage-identity-story-stack')).toBeNull();
    expect(screen.queryByTestId('homepage-presence-material')).toBeNull();
    expect(screen.queryByTestId('homepage-section-structure')).toBeNull();
  });
});
