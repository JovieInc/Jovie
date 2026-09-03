// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';

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
 * Full-viewport editorial hero: one quiet optical field, one headline, one
 * support line, and the existing name search as the single conversion control.
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
      <div
        className='homepage-editorial-hero__backdrop'
        aria-hidden='true'
        data-testid='homepage-editorial-hero-backdrop'
      >
        <div className='homepage-editorial-hero__stage' />
      </div>
      <div className='homepage-editorial-hero__copy'>
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
          />
        </div>
      </div>
    </section>
  );
}
