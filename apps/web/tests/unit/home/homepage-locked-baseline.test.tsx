// JOV-5864: pins the locked canonical homepage baseline so "design cook"
// regressions fail deterministic unit coverage. Literal copy locks here
// deliberately duplicate nothing already asserted verbatim in
// homepage-hero-next-move-contract.test.ts (hero headline/subhead/search).
// Canonical Pen homepage (Tim direction 2026-09-26).

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageCertifiedSections } from '@/components/homepage/HomepageCertifiedSections';
import { HomepageClose } from '@/components/homepage/HomepageClose';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

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
      <HomepageEditorialHero headingId='home-hero-heading' />
      <div data-testid='homepage-story-stack'>
        <HomepageCertifiedSections />
        <HomepageClose />
      </div>
    </>
  );
}

// Generic identity homepage: no single-ICP (music/artist) wording and no em
// dashes (canon/VOICE.md).
const ICP_LOCKED_TERMS =
  /\b(?:music|songs?|releases?|tours?|touring|fans?|streams?|albums?|presaves?)\b/i;

describe('JOV-5864 locked homepage baseline', () => {
  it('pins the canonical Pen body, close, and SEO copy verbatim', () => {
    expect(HOMEPAGE_LAUNCH_COPY.seo).toEqual({
      title: 'Jovie | A living identity for the internet',
      description:
        'Your work, your links, your next chapter. Together in your Jovie profile.',
    });

    expect(HOMEPAGE_LAUNCH_COPY.certified.sections).toEqual([
      {
        id: 'presence',
        eyebrow: 'Connected presence',
        headline: 'Your presence, resolved.',
        body: 'The work you share. The places people find you. Bring them together in your Jovie profile.',
        step: {
          headline: 'A clear next step.',
          body: 'Read the work. Start a conversation. Attend an event or send a payment.',
        },
      },
      {
        id: 'structure',
        eyebrow: 'An open system',
        headline: 'Structure that travels.',
        body: 'One identity. Room for everything you do, and whatever comes next.',
        identity: {
          label: '01 / Identity',
          title: 'Your Jovie profile',
          handle: 'jov.ie/you',
        },
        possibilities: {
          label: '02 / Possibilities',
          items: [
            { id: 'profile', title: 'Profile', detail: 'Name, story, work' },
            { id: 'links', title: 'Links', detail: 'One place to explore' },
            { id: 'events', title: 'Events', detail: 'A reason to meet' },
            {
              id: 'payments',
              title: 'Payments',
              detail: 'A direct way to pay',
            },
          ],
        },
      },
    ]);

    expect(HOMEPAGE_LAUNCH_COPY.certified.close).toEqual({
      headline: 'Make it your Jovie profile.',
      action: 'Find your profile',
    });
    expect(HOMEPAGE_LAUNCH_COPY.certified).not.toHaveProperty('changelog');
  });

  it('mounts hero, presence, structure, and the terminal close in locked order', () => {
    const { container } = render(<LockedHomepageBody />);

    const sectionIds = [...container.querySelectorAll('section')].map(
      section =>
        section.getAttribute('data-homepage-testid') ??
        section.getAttribute('data-testid')
    );
    expect(sectionIds).toEqual([
      'homepage-hero-shell',
      'homepage-section-presence',
      'homepage-section-structure',
      'homepage-close',
    ]);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'A living identity for the internet.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    ).toEqual([
      'Your presence, resolved.',
      'Structure that travels.',
      'Make it your Jovie profile.',
    ]);
    expect(screen.queryByText("What's new in Jovie")).toBeNull();
  });

  it('uses one Request access action in both conversion positions when gated', () => {
    gate.WAITLIST_ENABLED = true;
    render(<LockedHomepageBody />);
    const actions = screen.getAllByRole('link', { name: 'Request access' });
    expect(actions).toHaveLength(2);
    for (const action of actions) {
      expect(action).toHaveAttribute('href', '/signup');
    }
    expect(screen.queryAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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
  });

  it('keeps the mounted baseline generic, person-first, and free of em dashes', () => {
    gate.WAITLIST_ENABLED = true;
    const { certified, hero, seo } = HOMEPAGE_LAUNCH_COPY;
    const mountedCopy = [
      seo.title,
      seo.description,
      hero.eyebrow,
      hero.headline,
      hero.subhead,
      hero.specimen.name,
      hero.specimen.bio,
      hero.specimen.caption,
      ...hero.specimen.rows.flatMap(row => [row.title, row.detail]),
      certified.close.headline,
      ...certified.sections.flatMap(section => [
        section.eyebrow,
        section.headline,
        section.body,
      ]),
    ];

    for (const copy of mountedCopy) {
      expect(copy).not.toMatch(CATEGORY_LOCKED_TERMS);
      expect(copy).not.toMatch(ICP_LOCKED_TERMS);
      expect(copy).not.toContain('\u2014');
    }

    const { container } = render(<LockedHomepageBody />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(CATEGORY_LOCKED_TERMS);
    expect(text).not.toMatch(ICP_LOCKED_TERMS);
    expect(text).not.toContain('\u2014');
    expect(text).toContain('Jovie profile');
  });

  it('labels the fictional specimen as an illustrative preview with a real portrait', () => {
    render(<LockedHomepageBody />);
    const specimen = screen.getByTestId('homepage-profile-specimen');
    expect(specimen).toHaveAttribute('data-illustrative', 'true');
    expect(within(specimen).getByText('Avery Chen')).toBeInTheDocument();
    expect(
      within(specimen).getByText('Your Jovie profile · Illustrative preview')
    ).toBeInTheDocument();
    const portrait = within(specimen).getByRole('img');
    expect(portrait).toHaveAttribute(
      'src',
      '/assets/generated/homepage-avery-chen-portrait-v1.webp'
    );
    expect(portrait.getAttribute('alt')).toMatch(/fictional example/);
    // The specimen action is illustrative, never a second CTA.
    expect(within(specimen).queryByRole('link')).toBeNull();
    expect(within(specimen).queryByRole('button')).toBeNull();
  });

  it('uses each background image exactly once on the page', () => {
    const { container } = render(<LockedHomepageBody />);
    const backgrounds = [
      ...container.querySelectorAll('[data-background-image]'),
    ].map(node => node.getAttribute('data-background-image'));
    expect(backgrounds).toEqual([
      '/assets/generated/homepage-hero-technical-texture-v1.webp',
      '/assets/generated/homepage-presence-satin-v1.webp',
    ]);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);

    const sources = [...container.querySelectorAll('img')].map(img =>
      img.getAttribute('src')
    );
    for (const background of backgrounds) {
      expect(sources.filter(src => src === background)).toHaveLength(1);
    }
    expect(
      screen
        .getByTestId('homepage-identity-hero-texture')
        .closest('[data-testid="marketing-section-hero"]')
    ).not.toBeNull();
    expect(
      screen
        .getByTestId('homepage-presence-material')
        .closest('[data-homepage-testid="homepage-section-presence"]')
    ).not.toBeNull();
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
