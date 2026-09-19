import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomepageEditorialHero } from '@/components/homepage/HomepageEditorialHero';
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
    expect(heading).toHaveTextContent('Control how the world sees you.');
    expect(screen.getByTestId('marketing-section-hero')).toHaveAttribute(
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

  it('keeps the centered hero abstract and free of distracting media', () => {
    renderHero();

    const backdrop = screen.getByTestId('homepage-editorial-hero-backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop).toHaveAttribute('data-hero-layer', 'decorative');
    expect(backdrop).toHaveAttribute(
      'data-hero-visual',
      'abstract-light-field'
    );
    const hero = screen.getByTestId('marketing-section-hero');
    expect(hero).toHaveAttribute('data-homepage-testid', 'homepage-hero-shell');
    expect(hero).toHaveAttribute('data-marketing-variant', 'centered-none');
    expect(hero).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/homepage/HomepageEditorialHero.tsx'
    );
    expect(hero.querySelectorAll('picture, img, video, canvas')).toHaveLength(
      0
    );
  });

  it('keeps the active copy and search inside the canonical stage wrapper', () => {
    renderHero();

    const hero = screen.getByTestId('marketing-section-hero');
    const stage = hero.querySelector('.homepage-editorial-hero__stage');
    const copy = hero.querySelector('.homepage-editorial-hero__copy');
    if (!stage || !copy) throw new Error('Homepage hero stage is missing');

    expect(stage).toContainElement(copy);
    expect(copy).toHaveAttribute('data-hero-layer', 'active');
    expect(stage).toContainElement(
      screen.getByTestId('homepage-editorial-hero-search')
    );
    expect(stage).toContainElement(screen.getByTestId('homepage-primary-cta'));
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
