import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_HERO_TEXTURE,
  HomepageEditorialHero,
} from '@/components/homepage/HomepageEditorialHero';
import { HomepagePrimaryAction } from '@/components/homepage/HomepagePrimaryAction';
import {
  HOMEPAGE_CERTIFIED_EVENTS,
  HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT,
  HOMEPAGE_CERTIFIED_VARIANT_ID,
} from '@/data/homepageCertifiedOptimization';

const { trackAction } = vi.hoisted(() => ({ trackAction: vi.fn() }));
vi.mock('@/components/homepage/homepage-analytics', () => ({
  trackHomepageEvent: trackAction,
}));

const gate = vi.hoisted(() => ({ WAITLIST_ENABLED: false }));
vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: gate }));
beforeEach(() => {
  gate.WAITLIST_ENABLED = false;
});

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
    const { fill, priority, quality, loading, ...rest } = props;
    void fill;
    void priority;
    void quality;
    void loading;
    return <img alt='' {...rest} />;
  },
}));

function renderHero() {
  return render(<HomepageEditorialHero headingId='home-hero-heading' />);
}

describe('HomepageEditorialHero', () => {
  it('attributes a standalone closing access action to its caller', () => {
    gate.WAITLIST_ENABLED = true;
    render(
      <HomepagePrimaryAction
        submitTestId='closing-access'
        submitAnalytics={{
          eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
          properties: { placement: 'close' },
        }}
      />
    );
    const action = screen.getByRole('link', { name: 'Request access' });
    action.addEventListener('click', event => event.preventDefault());
    fireEvent.click(action);
    expect(action).toHaveAttribute('href', '/signup');
    expect(action).toHaveAttribute('data-testid', 'closing-access');
    expect(trackAction).toHaveBeenLastCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED,
      { placement: 'close' }
    );
  });
  it('routes waitlist-on visitors to access with no name-search control', () => {
    gate.WAITLIST_ENABLED = true;
    renderHero();
    expect(
      screen.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');
    const action = screen.getByRole('link', { name: 'Request access' });
    action.addEventListener('click', event => event.preventDefault());
    fireEvent.click(action);
    expect(trackAction).toHaveBeenCalledWith(
      HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED,
      expect.objectContaining({ placement: 'hero' })
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('renders one heading, one support line, and the name search as the only control', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveTextContent('A living identity for the internet.');
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
      'aria-labelledby',
      heading.id
    );
    expect(
      screen.getByText(
        'Your work, your links, your next chapter. Together in your Jovie profile.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Jovie / Identity, connected')).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-hero-layer="active"]')
    ).toHaveLength(1);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', 'Search your name');

    const submit = screen.getByTestId('homepage-primary-cta');
    expect(submit).toHaveTextContent('Find me');
    expect(submit).toHaveAttribute('data-size', 'marketing');
    expect(submit).toHaveAttribute('data-variant', 'primary');
    expect(submit).toHaveClass('h-auto', 'min-h-7', 'rounded-full');
    expect(submit).toHaveClass(
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    for (const fixedHeight of ['h-7', 'h-11', 'h-11!', 'h-12']) {
      expect(submit).not.toHaveClass(fixedHeight);
    }
    expect(submit).toBeEnabled();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('docks the blue technical texture as a decorative, priority hero layer', () => {
    renderHero();

    const texture = screen.getByTestId('homepage-identity-hero-texture');
    expect(texture).toHaveAttribute('aria-hidden', 'true');
    expect(texture).toHaveAttribute('data-hero-layer', 'decorative');
    expect(texture).toHaveAttribute('data-hero-visual', 'technical-texture');
    expect(texture.querySelector('img')).toHaveAttribute(
      'src',
      HOMEPAGE_HERO_TEXTURE.src
    );
    expect(texture.querySelector('img')).toHaveAttribute('alt', '');

    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveClass(
      'marketing-hero-dock',
      'marketing-hero-dock--inset'
    );
    expect(hero).toHaveAttribute('data-homepage-testid', 'homepage-hero-shell');
    expect(hero).toHaveAttribute('data-marketing-variant', 'centered-none');
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageEditorialHero.tsx'
    );
    // Only the texture and the specimen portrait; no video or canvas.
    expect(hero.querySelectorAll('video, canvas')).toHaveLength(0);
    expect(hero.querySelectorAll('img')).toHaveLength(2);
  });

  it('keeps hero motion CSS-only, bounded, offscreen-paused, and reduced-motion still', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'components/homepage/HomepageIdentity.css'),
      'utf8'
    );
    const texture = css.slice(
      css.indexOf('.homepage-identity-hero__texture {'),
      css.indexOf('}', css.indexOf('.homepage-identity-hero__texture {'))
    );
    expect(texture).toContain(
      'animation: homepage-identity-texture-drift 20s ease-in-out infinite'
    );
    expect(texture).toContain('content-visibility: auto');
    const keyframes = css.slice(
      css.indexOf('@keyframes homepage-identity-texture-drift'),
      css.indexOf('@media (prefers-reduced-motion: reduce)')
    );
    // <= 12px translate (space-3) and <= 1.02 scale.
    expect(keyframes).toContain('calc(-1 * var(--space-3))');
    expect(keyframes).toContain('scale(1.02)');
    expect(keyframes).not.toMatch(/hue-rotate|filter/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.homepage-identity-hero__texture \{\s*animation: none;/
    );
    // Text-aware imagery: a static scrim keeps the docked header and hero
    // copy legible over the texture (Tim rule 2026-09-26).
    const scrim = css.slice(
      css.indexOf('.homepage-identity-hero::before {'),
      css.indexOf('.homepage-identity-hero__texture {')
    );
    expect(scrim).toContain('var(--public-shell-header-offset)');
    expect(scrim).toContain('var(--homepage-identity-hero-ground)');
    expect(scrim).not.toContain('animation');
    // Copy and controls never animate.
    expect(css.match(/animation:/g)).toHaveLength(2);
  });
});

describe('certified homepage optimization contract (JOV-INV-012)', () => {
  it('names the stable variant, exposure, outcome, and rollback', () => {
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.variantIdentity).toBe(
      HOMEPAGE_CERTIFIED_VARIANT_ID
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.exposure).toBe(
      HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.outcome).toBe(
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED
    );
    expect(
      HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.attribution.surfaces
    ).toEqual([
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ]);
    expect(
      HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.eligibleContextDimensions
    ).toContain('platform');
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.hypothesis).toMatch(
      /name-search hero/
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.primaryMetric).toContain(
      HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.guardrails).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/No competing hero CTA/),
        expect.stringMatching(/search query text/),
      ])
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.privacyAndConsent).toMatch(
      /Anonymous page analytics/
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.optimizerOwner).toBe(
      'Product'
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.cadence).toMatch(/weekly/);
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.decisionWriteback).toMatch(
      /JOV-5864/
    );
    expect(HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT.rollbackOrControl).toMatch(
      /MarketingPosterHero/
    );
  });
});
