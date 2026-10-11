// JOV-5864: pins the locked canonical homepage baseline so "design cook"
// regressions fail deterministic unit coverage. Literal copy locks here
// deliberately duplicate nothing already asserted verbatim in
// homepage-hero-next-move-contract.test.ts (hero headline/subhead/search).

import { fireEvent, render, screen, within } from '@testing-library/react';
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
      title: 'Jovie | Be found. Be understood.',
      description:
        'Claim your name. Jovie makes you easy to reach, for people and for agents.',
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
            caption: 'Tim’s updates, sent only to people who asked for them.',
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
      'marketing-section-hero',
      'homepage-section-relationships',
      'homepage-editorial-changelog',
      'homepage-close',
    ]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Be found.Be understood.',
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

  it('keeps the jov.ie/you claim and /start handoff whatever the waitlist gate', () => {
    for (const waitlist of [true, false]) {
      gate.WAITLIST_ENABLED = waitlist;
      const { unmount } = render(<LockedHomepageBody />);
      expect(screen.getByTestId('homepage-claim-form')).toHaveAttribute(
        'action',
        '/start'
      );
      expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
      expect(screen.queryByPlaceholderText('Search your name')).toBeNull();
      expect(screen.queryByText('Request access')).toBeNull();
      expect(screen.queryByText('Get started')).toBeNull();
      unmount();
    }
  });

  it('keeps one hero claim with one terminal return action', () => {
    render(<LockedHomepageBody />);

    expect(screen.getAllByRole('button', { name: 'Claim' })).toHaveLength(1);
    const close = screen.getByTestId('marketing-section-cta');
    fireEvent.click(
      within(close).getByRole('button', { name: 'Find your profile' })
    );
    expect(document.getElementById('homepage-claim-handle')).toHaveFocus();
  });

  it('keeps the mounted baseline person-first and category-neutral', () => {
    const { certified } = HOMEPAGE_LAUNCH_COPY;
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const mountedCopy = [
      seo.title,
      seo.description,
      hero.headline,
      hero.subhead,
      hero.claim.placeholder,
      hero.claim.action,
      certified.close.headline,
      certified.close.action,
      certified.changelog.headline,
      certified.changelog.allPostsLabel,
      ...certified.sections.flatMap(section => [
        section.headline,
        section.body,
        ...section.steps.map(step => step.caption),
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
