// JOV-5864: pins the locked canonical homepage baseline so "design cook"
// regressions fail deterministic unit coverage. Literal copy locks here
// deliberately duplicate nothing already asserted verbatim in
// homepage-hero-next-move-contract.test.ts (hero headline/subhead/search).

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import {
  HOMEPAGE_EDITORIAL_CARDS,
  HomepageEditorialChangelog,
} from '@/components/homepage/HomepageEditorialChangelog';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { HOMEPAGE_MEDIA_MAP } from '@/data/homepageMediaMap';

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: false }));
vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      get WAITLIST_ENABLED() {
        return gate.WAITLIST_ENABLED;
      },
    },
  };
});
beforeEach(() => {
  gate.WAITLIST_ENABLED = false;
});

const CATEGORY_LOCKED_TERMS =
  /\b(?:artists?|musicians?|singers?|songwriters?|bands?|djs?|rappers?|producers?|creators?)\b/i;

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/',
  };
});

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
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
    const { fill, unoptimized, priority, quality, loading, ...rest } = props;
    void fill;
    void unoptimized;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

function LockedHomepageBody() {
  return (
    <>
      <HomepageIdentityHero headingId='home-hero-heading' />
      <div data-testid='homepage-story-stack'>
        <HomepageCertifiedSections
          previews={{
            subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
            pay: HOMEPAGE_MEDIA_MAP.pay.asset,
          }}
        />
        <HomepageEditorialChangelog />
        <HomepageClose />
      </div>
    </>
  );
}

describe('JOV-5864 locked homepage baseline', () => {
  it('pins the certified body, close, changelog, and SEO copy verbatim', () => {
    expect(HOMEPAGE_IDENTITY_COPY.seo).toEqual({
      title: 'Jovie | Your living identity on the internet',
      description:
        'Your work, your links, your next chapter. Together in your Jovie profile.',
    });

    // Pen My0zu (JOV-6946): one relationships beat with real next steps.
    expect(HOMEPAGE_LAUNCH_COPY.certified.sections).toEqual([
      {
        id: 'relationships',
        headline: 'Turn attention into relationships.',
        body: 'Give every person a tailored next step, without forcing everyone through the same funnel.',
        steps: [
          { id: 'pay', caption: 'A direct way to pay Tim, in one tap.' },
          {
            id: 'subscribe',
            caption: 'Updates from Tim, straight to the people who care.',
          },
        ],
      },
    ]);

    expect(HOMEPAGE_LAUNCH_COPY.certified.close).toEqual({
      headline: 'Take control of your presence.',
      action: 'Find your profile',
    });

    expect(HOMEPAGE_LAUNCH_COPY.certified.changelog).toEqual({
      headline: "What's new in Jovie",
      allPostsLabel: 'All posts',
    });
  });

  it('mounts hero, chapters, changelog, and the terminal close in locked order', () => {
    const { container } = render(<LockedHomepageBody />);

    const sectionIds = [...container.querySelectorAll('section')].map(
      section =>
        section.getAttribute('data-homepage-testid') ??
        section.getAttribute('data-testid')
    );
    expect(sectionIds).toEqual([
      'homepage-hero-shell',
      'homepage-section-relationships',
      'homepage-editorial-changelog',
      'homepage-close',
    ]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your living identity on the internet.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: "What's new in Jovie" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Take control of your presence.',
      })
    ).toBeInTheDocument();
  });

  it('keeps the name search and /start handoff when the waitlist gate is on', () => {
    gate.WAITLIST_ENABLED = true;
    render(<LockedHomepageBody />);
    expect(screen.getByPlaceholderText('Search your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Request access' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Get started')).toBeNull();
  });

  it('keeps one canonical name search with one terminal return action', () => {
    render(<LockedHomepageBody />);

    const searches = screen.getAllByPlaceholderText('Search your name');
    expect(searches).toHaveLength(1);
    expect(document.getElementById('homepage-name-search')).toBe(searches[0]);

    expect(screen.getAllByRole('button', { name: 'Find me' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.queryByText('Get started')).toBeNull();

    const close = screen.getByTestId('marketing-section-cta');
    expect(
      within(close).getByRole('button', { name: 'Find your profile' })
    ).toBeInTheDocument();
    expect(within(close).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('homepage-close-search')).toBeNull();
  });

  it('keeps the mounted baseline person-first and category-neutral', () => {
    const { certified } = HOMEPAGE_LAUNCH_COPY;
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const mountedCopy = [
      seo.title,
      seo.description,
      hero.headline,
      hero.subhead,
      hero.search.placeholder,
      hero.search.action,
      certified.close.headline,
      certified.close.action,
      certified.changelog.headline,
      certified.changelog.allPostsLabel,
      ...certified.sections.flatMap(section => [
        ...('eyebrow' in section ? [section.eyebrow] : []),
        section.headline,
        section.body,
        ...('outcomes' in section
          ? section.outcomes.flatMap(outcome => [
              outcome.headline,
              outcome.body,
            ])
          : []),
      ]),
      ...HOMEPAGE_EDITORIAL_CARDS.flatMap(card => [
        card.title,
        card.category,
        card.themeTitle,
        card.themeSupport,
      ]),
    ];

    for (const copy of mountedCopy) {
      expect(copy).not.toMatch(CATEGORY_LOCKED_TERMS);
    }

    const { container } = render(
      <div data-testid='homepage-story-stack'>
        <HomepageCertifiedSections
          previews={{
            subscribe: HOMEPAGE_MEDIA_MAP.relationships.asset,
            pay: HOMEPAGE_MEDIA_MAP.pay.asset,
          }}
        />
        <HomepageEditorialChangelog />
        <HomepageClose />
      </div>
    );
    expect(container.textContent ?? '').not.toMatch(CATEGORY_LOCKED_TERMS);
  });

  it('keeps the supported agent path in the shared expanded footer', () => {
    render(<MarketingFooter variant='expanded' />);

    const footer = screen.getByTestId('marketing-footer');
    expect(within(footer).getByRole('link', { name: 'CLI' })).toHaveAttribute(
      'href',
      '/cli'
    );
    expect(
      within(footer).getByRole('link', { name: 'Developers' })
    ).toHaveAttribute('href', '/developers');

    // The homepage owns its final CTA; the footer must not mount a second one.
    expect(screen.queryByTestId('marketing-footer-cta')).toBeNull();
  });
});
