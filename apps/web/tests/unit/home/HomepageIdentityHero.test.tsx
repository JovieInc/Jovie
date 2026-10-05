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

// Generic identity homepage: no single-ICP wording, no em dashes.
const ICP_TERMS =
  /\b(?:artists?|musicians?|music|songs?|releases?|tours?|fans?|streams?|albums?|presaves?|creators?)\b/i;

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

      // Each declared alternative must match the mounted hero, even though the
      // performance runner accepts the first visible readiness candidate.
      for (const selector of [
        ...route.readySelectors.shell,
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
    expect(hero).toHaveAttribute('data-marketing-variant', 'split-claim-card');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Be found.Be understood.');
    expect(hero).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      screen.getByText(HOMEPAGE_IDENTITY_COPY.hero.subhead)
    ).toBeInTheDocument();

    const claim = screen.getByTestId('homepage-claim-form');
    expect(claim).toHaveAttribute('action', '/start');
    expect(within(claim).getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'you'
    );
    expect(screen.getByTestId('homepage-primary-cta')).toHaveTextContent(
      'Claim'
    );
    // Phones: the claim leads the card so the consent banner never covers it.
    expect(screen.getByTestId('homepage-editorial-hero-search')).toHaveClass(
      'order-first',
      'sm:order-none'
    );
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

  it('proves the claim with the real jov.ie/tim profile and shows no product screenshot', () => {
    render(<HomepageIdentityHero />);

    const proof = screen.getByTestId('homepage-hero-real-profile');
    expect(within(proof).getByRole('img')).toHaveAttribute(
      'alt',
      HOMEPAGE_IDENTITY_COPY.hero.proofAlt
    );
    expect(proof).toHaveTextContent('Tim White');
    expect(screen.queryByText(/Avery|Illustrative/)).toBeNull();
    expect(document.querySelectorAll('video, canvas')).toHaveLength(0);
  });

  it('keeps the claim card narrow and the role on one line at 768 (JOV-7126)', () => {
    render(<HomepageIdentityHero />);

    // Pen x4j9f (768 split): the claim card is ~340px (max-w-85), not the
    // wider max-w-120 the split shell's half-width column at 768 can't fit
    // alongside the headline. whitespace-nowrap keeps "Founder, Jovie" from
    // wrapping when that column gets tight. Real layout/line-wrap coverage
    // lives in the Playwright regression at tests/e2e/homepage.spec.ts,
    // since jsdom does not lay out text.
    const card = screen.getByTestId('homepage-claim-card');
    expect(card.className).toContain('max-w-85');
    expect(card.className).not.toContain('max-w-120');

    const role = screen.getByText(HOMEPAGE_IDENTITY_COPY.hero.preview.role);
    expect(role.className).toContain('whitespace-nowrap');

    const source = css();
    expect(source).toMatch(
      /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1279px\)/
    );
  });

  it('keeps hero copy generic and free of em dashes', () => {
    const { hero, seo } = HOMEPAGE_IDENTITY_COPY;
    const copy = [
      seo.title,
      seo.description,
      hero.headline,
      hero.subhead,
      ...Object.values(hero.preview),
    ];
    for (const line of copy) {
      expect(line).not.toMatch(ICP_TERMS);
      expect(line).not.toContain('—');
    }
    const { container } = render(<HomepageIdentityHero />);
    expect(container.textContent ?? '').not.toMatch(ICP_TERMS);
    expect(container.textContent ?? '').not.toContain('—');
  });

  it('keeps the hero stylesheet tokenized', () => {
    const source = css();
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(source).not.toContain('var(--linear-');
    expect(source).not.toMatch(/\b(?:url|image-set)\s*\(/);
  });
});
