// @coverage-via apps/web/tests/unit/home/HomepageCertifiedSections.test.tsx
import { Logo } from '@/components/atoms/Logo';
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';

/**
 * Section 9: the close. Repeats the hero's only conversion control — the
 * existing name search — under the locked closing lines, then signs off with
 * a quiet, non-interactive wordmark.
 */
export function HomepageClose() {
  const { close } = HOMEPAGE_LAUNCH_COPY.certified;
  const { search } = HOMEPAGE_LAUNCH_COPY.hero;

  return (
    <section
      className='homepage-close'
      data-testid='homepage-close'
      aria-labelledby='homepage-close-heading'
    >
      <div className='homepage-close__inner'>
        <h2
          id='homepage-close-heading'
          className='homepage-close__headline'
          data-homepage-section-heading
        >
          {close.headline}
        </h2>
        <p className='homepage-close__support'>{close.support}</p>
        <div
          className='homepage-close__search'
          data-testid='homepage-close-search'
        >
          <HeroSpotifySearch
            appearance='editorial'
            inputId='homepage-close-name-search'
            placeholder={search.placeholder}
            submitLabel={search.action}
            submitTestId='homepage-close-cta'
          />
        </div>
        <div
          className='homepage-close__mark'
          data-testid='homepage-close-mark'
        >
          <Logo variant='word' size='xs' aria-hidden />
        </div>
      </div>
    </section>
  );
}
