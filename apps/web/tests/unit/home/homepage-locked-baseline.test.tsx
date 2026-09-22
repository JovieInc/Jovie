// JOV-5864: pins the locked canonical homepage baseline so "design cook"
// regressions fail deterministic unit coverage. Literal copy locks here
// deliberately duplicate nothing already asserted verbatim in
// homepage-hero-next-move-contract.test.ts (hero headline/subhead/search).

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import {
  HOMEPAGE_EDITORIAL_CARDS,
  HomepageEditorialChangelog,
} from '@/components/homepage/HomepageEditorialChangelog';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { HERO_COPY } from '@/components/homepage/intent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

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
      <HomepageEditorialHero
        headingId='home-hero-heading'
        headline={HERO_COPY.headline}
        support={HERO_COPY.subhead}
        search={HERO_COPY.search}
      />
      <div data-testid='homepage-story-stack'>
        <HomepageCertifiedSections />
        <HomepageEditorialChangelog />
        <HomepageClose />
      </div>
    </>
  );
}

describe('JOV-5864 locked homepage baseline', () => {
  it('pins the certified body, close, changelog, and SEO copy verbatim', () => {
    expect(HOMEPAGE_LAUNCH_COPY.seo).toEqual({
      title: 'Jovie | Control how the world sees you',
      description: 'Find what the internet knows. Turn it into relationships.',
    });

    expect(HOMEPAGE_LAUNCH_COPY.certified.sections).toEqual([
      {
        id: 'connected',
        eyebrow: 'ONE LIVING PROFILE',
        headline: 'Everything about you, connected.',
        body: 'Your work, links, and story. One living profile.',
      },
      {
        id: 'relationships',
        headline: 'Turn attention into relationships.',
        body: 'Give every person a tailored next step—follow, subscribe, listen, buy, book, or reach out—without forcing everyone through the same funnel.',
        outcomes: [
          {
            id: 'found',
            headline: 'Be found. Be understood.',
            body: 'Share the right version of you, legible wherever people want to know how you can help.',
          },
          {
            id: 'know',
            headline: 'Know who cares.',
            body: 'See who is paying attention, what brought them to you, and what they may want next.',
          },
          {
            id: 'built',
            headline: 'Built around who you are.',
            body: 'Jovie adapts to your work without reducing you to a category.',
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
      'homepage-section-connected',
      'homepage-section-relationships',
      'homepage-editorial-changelog',
      'homepage-close',
    ]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Control how the world sees you.',
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

  it('keeps one canonical name search with one terminal return action', () => {
    render(<LockedHomepageBody />);

    const searches = screen.getAllByPlaceholderText('Search your name');
    expect(searches).toHaveLength(1);
    expect(document.getElementById('homepage-name-search')).toBe(searches[0]);

    expect(
      screen.getAllByRole('button', { name: 'Find me', exact: true })
    ).toHaveLength(1);
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
    const { certified, hero, seo } = HOMEPAGE_LAUNCH_COPY;
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
        <HomepageCertifiedSections />
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
