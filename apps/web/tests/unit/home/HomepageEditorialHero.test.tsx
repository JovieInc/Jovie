import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
import {
  HOMEPAGE_CERTIFIED_EVENTS,
  HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT,
  HOMEPAGE_CERTIFIED_VARIANT_ID,
} from '@/data/homepageCertifiedOptimization';

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

function renderHero() {
  return render(
    <HomepageEditorialHero
      headingId='home-hero-heading'
      headline='Control how the world sees you.'
      support='Find what the internet knows. Turn it into relationships.'
      search={{ placeholder: 'Search your name', action: 'Find me' }}
    />
  );
}

describe('HomepageEditorialHero', () => {
  it('renders one heading, one support line, and the name search as the only control', () => {
    renderHero();

    const heading = screen.getByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveTextContent('Control how the world sees you.');
    expect(screen.getByTestId('homepage-hero-shell')).toHaveAttribute(
      'aria-labelledby',
      heading.id
    );
    expect(
      screen.getByText(
        'Find what the internet knows. Turn it into relationships.'
      )
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll('[data-hero-layer="active"]')
    ).toHaveLength(1);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('placeholder', 'Search your name');

    const submit = screen.getByTestId('homepage-primary-cta');
    expect(submit).toHaveTextContent('Find me');
    expect(submit).toHaveAttribute('data-size', 'marketing');
    expect(submit).toHaveAttribute('data-variant', 'primary');
    expect(submit).toHaveClass('h-8', 'rounded-full');
    expect(submit).toBeEnabled();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the centered hero abstract and free of distracting media', () => {
    renderHero();

    const backdrop = screen.getByTestId('homepage-editorial-hero-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveAttribute('data-hero-layer', 'decorative');
    expect(backdrop).toHaveAttribute(
      'data-hero-visual',
      'abstract-light-field'
    );
    const hero = screen.getByTestId('homepage-hero-shell');
    expect(hero.querySelectorAll('picture, img, video, canvas')).toHaveLength(
      0
    );
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
