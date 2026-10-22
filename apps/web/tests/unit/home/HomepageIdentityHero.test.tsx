// Homepage identity + link-claim hero (Tim 2026-09-28, Pen STAGING Cyuz2).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageIdentityHero } from '@/components/homepage/HomepageIdentityHero';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { getEndUserPerfRouteById } from '@/scripts/performance-route-manifest';

const { trackAction } = vi.hoisted(() => ({ trackAction: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: trackAction,
}));

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: true }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));
beforeEach(() => {
  gate.WAITLIST_ENABLED = true;
});

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    const { fill, priority, quality, ...rest } = props;
    void fill;
    void quality;
    return (
      <img alt='' data-priority={priority ? 'true' : undefined} {...rest} />
    );
  },
}));

function css(): string {
  return readFileSync(
    resolve(process.cwd(), 'components/homepage/HomepageIdentity.css'),
    'utf8'
  );
}

describe('HomepageIdentityHero', () => {
  it.each([true, false])(
    'binds homepage performance readiness to the rendered claim with waitlist=%s',
    waitlist => {
      gate.WAITLIST_ENABLED = waitlist;
      const { container } = render(
        <HomepageIdentityHero headingId='home-hero-heading' />
      );
      const route = getEndUserPerfRouteById('home');
      expect(route).toBeDefined();
      if (!route) throw new Error('Missing home performance route');
      const shellSelectors = route.readySelectors.shell;
      if (!shellSelectors) {
        throw new Error('Missing home shell readiness selectors');
      }

      // Each declared alternative must match the mounted hero, even though the
      // performance runner accepts the first visible readiness candidate.
      for (const selector of [
        ...shellSelectors,
        ...(route.readySelectors.content ?? []),
      ]) {
        expect(container.querySelector(selector), selector).toBeVisible();
      }
      const claimInput = within(
        screen.getByTestId('homepage-claim-form')
      ).getByRole('textbox');
      expect(
        route.readySelectors.content?.some(selector =>
          claimInput.matches(selector)
        )
      ).toBe(true);
      expect(container.querySelector('input#homepage-intent-input')).toBeNull();
    }
  );

  it('renders the identity headline and the jov.ie/you link claim (Tim 2026-09-28)', () => {
    render(<HomepageIdentityHero headingId='home-hero-heading' />);

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero.tagName).toBe('SECTION');
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageIdentityHero.tsx'
    );
    expect(hero).toHaveAttribute('data-marketing-variant', 'centered-claim');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Start with your name');
    expect(hero).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      screen.getByText(HOMEPAGE_IDENTITY_COPY.hero.subhead)
    ).toBeInTheDocument();

    const claim = screen.getByTestId('homepage-claim-form');
    expect(claim).toHaveAttribute('action', '/start');
    expect(within(claim).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Your name or handle'
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Claim'
    );
    expect(within(hero).queryByRole('img', { name: 'Jovie logo' })).toBeNull();
    expect(
      within(hero).queryByText(HOMEPAGE_IDENTITY_COPY.hero.subhead)
    ).toBeNull();
    expect(screen.queryByText('Search your name')).toBeNull();
    expect(screen.queryByText('Request access')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('keeps the claim as the only control whatever the waitlist gate', () => {
    for (const waitlist of [true, false]) {
      gate.WAITLIST_ENABLED = waitlist;
      const { unmount } = render(<HomepageIdentityHero />);
      expect(screen.getAllByRole('button')).toHaveLength(1);
      expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
        'Claim'
      );
      unmount();
    }
  });

  it('shows the visitor identity without presenting a founder or claimed customer', () => {
    render(<HomepageIdentityHero />);

    const identity = screen.getByTestId('homepage-hero-identity');
    expect(identity).toHaveTextContent('jov.ie/you');
    expect(identity).toHaveTextContent('Your artist profile');
    expect(within(identity).queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Tim White|Founder|Claimed|Avery/)).toBeNull();
    expect(document.querySelectorAll('video')).toHaveLength(0);
    expect(screen.getByTestId('marketing-ambient-field')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('marketing-ambient-field')).toHaveAttribute(
      'data-variant',
      'refracted'
    );
  });

  it('keeps explanatory copy after the entry rather than above its input', () => {
    render(<HomepageIdentityHero />);
    const hero = screen.getByTestId('marketing-section-hero');
    const explanation = screen.getByTestId('homepage-hero-explanation');
    expect(hero).not.toContainElement(explanation);
    expect(
      screen.getByTestId('homepage-hero-scroll-region').nextElementSibling
    ).toBe(explanation);
    expect(within(hero).queryByTestId('homepage-hero-identity')).toBeNull();
    expect(
      within(explanation).getByText(HOMEPAGE_IDENTITY_COPY.hero.subhead)
    ).toBeVisible();
    // Real fold, reflow and focus geometry are measured by the Storybook browser spec.
  });

  it('keeps the headline and real claim in the existing centered owner', () => {
    render(<HomepageIdentityHero />);

    const layout = screen.getByTestId('marketing-section-hero');
    const heading = screen.getByRole('heading', { level: 1 });
    const copy = heading.parentElement;
    const card = screen.getByTestId('homepage-claim-card');
    if (!copy) throw new Error('Missing hero copy slot');

    // Grid placement depends on these being direct children of the shared
    // hero. A new wrapper must not detach either slot from its scoped rules.
    expect(layout).toHaveClass('homepage-claim-hero__layout');
    expect(copy).toHaveClass('homepage-claim-hero__copy');
    expect(card).toHaveClass('homepage-claim-hero__card');
    expect(Array.from(layout.children)).toEqual([copy, card]);
    expect(within(copy).queryByRole('img', { name: 'Jovie logo' })).toBeNull();
    expect(
      within(copy).queryByText(HOMEPAGE_IDENTITY_COPY.hero.subhead)
    ).toBeNull();
    expect(within(copy).queryByRole('textbox')).toBeNull();
    expect(within(card).getByTestId('homepage-claim-form')).toContainElement(
      screen.getByRole('textbox')
    );
    expect(within(card).queryByTestId('homepage-hero-identity')).toBeNull();
  });

  it('describes the free artist profile without inventing a paid launch benefit', () => {
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const copy = [
      seo.title,
      seo.description,
      hero.headline,
      hero.subhead,
      ...Object.values(hero.preview),
    ];
    for (const line of copy) {
      expect(line).not.toContain('—');
    }
    const { container } = render(<HomepageIdentityHero />);
    expect(container).toHaveTextContent('Your music and links, together.');
    expect(container.textContent ?? '').not.toMatch(
      /\$12|\$199|continuous monitoring|unattended|advanced analytics/i
    );
    expect(container.textContent ?? '').not.toContain('—');
  });

  it('loads the production variable font assets for the homepage review', () => {
    const preview = readFileSync(
      resolve(process.cwd(), '.storybook/production-fonts.css'),
      'utf8'
    );
    const production = readFileSync(
      resolve(process.cwd(), 'app/layout.tsx'),
      'utf8'
    );
    for (const font of ['Inter-Latin.woff2', 'Satoshi-Latin.woff2']) {
      expect(production).toContain(font);
      expect(preview).toContain(font);
    }
    expect(preview).toContain('100 900');
    expect(preview).toContain('300 900');
  });

  it('keeps the hero stylesheet tokenized', () => {
    const source = css();
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(source).not.toContain('var(--linear-');
    expect(source).not.toMatch(/\b(?:url|image-set)\s*\(/);
  });
});
