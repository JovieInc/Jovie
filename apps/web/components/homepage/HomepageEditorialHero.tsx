// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';
import {
  HOMEPAGE_CERTIFIED_CONTEXT,
  HOMEPAGE_CERTIFIED_EVENTS,
} from '@/data/homepageCertifiedOptimization';
import { HomepageCertifiedExposure } from './HomepageCertifiedExposure';

export interface HomepageEditorialHeroSearch {
  readonly placeholder: string;
  readonly action: string;
}

export interface HomepageEditorialHeroProps {
  readonly headline: string;
  readonly support: string;
  readonly search: HomepageEditorialHeroSearch;
  readonly headingId?: string;
}

/**
 * Full-viewport editorial hero: a quiet abstract light field, one headline,
 * one support line, and the existing name search as the single conversion
 * control. The backdrop is CSS-only so product meaning remains the focal point.
 */
export function HomepageEditorialHero({
  headline,
  support,
  search,
  headingId = 'homepage-editorial-hero-heading',
}: HomepageEditorialHeroProps) {
  return (
    <section
      className='homepage-editorial-hero'
      aria-labelledby={headingId}
      data-testid='homepage-hero-shell'
    >
      <HomepageCertifiedExposure />
      <div
        className='homepage-editorial-hero__backdrop'
        aria-hidden='true'
        data-hero-layer='decorative'
        data-hero-visual='abstract-light-field'
        data-testid='homepage-editorial-hero-backdrop'
      >
        <div className='homepage-editorial-hero__light-well' />
      </div>
      <div className='homepage-editorial-hero__copy' data-hero-layer='active'>
        <h1 id={headingId} className='homepage-editorial-hero__headline'>
          {headline}
        </h1>
        <p className='homepage-editorial-hero__support'>{support}</p>
        <div
          className='homepage-editorial-hero__search'
          data-testid='homepage-editorial-hero-search'
        >
          <HeroSpotifySearch
            appearance='editorial'
            inputId='homepage-name-search'
            placeholder={search.placeholder}
            submitLabel={search.action}
            submitTestId='homepage-primary-cta'
            submitAnalytics={{
              eventName: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
              properties: {
                ...HOMEPAGE_CERTIFIED_CONTEXT,
                placement: 'hero',
              },
            }}
          />
        </div>
      </div>
    </section>
  );
}
