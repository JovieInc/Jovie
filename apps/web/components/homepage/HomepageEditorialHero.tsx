// @coverage-via apps/web/tests/unit/home/HomepageEditorialHero.test.tsx
import { getImageProps } from 'next/image';
import { HeroSpotifySearch } from '@/components/features/home/HeroSpotifySearch';

export interface HomepageEditorialHeroBackdrop {
  readonly desktopSrc: string;
  readonly desktopWidth: number;
  readonly desktopHeight: number;
  readonly mobileSrc: string;
  readonly mobileWidth: number;
  readonly mobileHeight: number;
}

export interface HomepageEditorialHeroSearch {
  readonly placeholder: string;
  readonly action: string;
}

export interface HomepageEditorialHeroProps {
  readonly headline: string;
  readonly support: string;
  readonly search: HomepageEditorialHeroSearch;
  readonly backdrop: HomepageEditorialHeroBackdrop;
  readonly headingId?: string;
}

const BACKDROP_MOBILE_MEDIA = '(max-width: 767px)';

/**
 * Full-viewport editorial hero: one photo behind, one headline, one support
 * line, and the existing name search as the single conversion control.
 *
 * The backdrop is art-directed with a <picture> element because next/image
 * cannot switch sources per viewport; getImageProps keeps both sources on the
 * optimizer pipeline.
 */
export function HomepageEditorialHero({
  headline,
  support,
  search,
  backdrop,
  headingId = 'homepage-editorial-hero-heading',
}: HomepageEditorialHeroProps) {
  const shared = {
    alt: '',
    priority: true,
    quality: 82,
    sizes: '100vw',
  } as const;
  const { props: desktop } = getImageProps({
    ...shared,
    src: backdrop.desktopSrc,
    width: backdrop.desktopWidth,
    height: backdrop.desktopHeight,
  });
  const { props: mobile } = getImageProps({
    ...shared,
    src: backdrop.mobileSrc,
    width: backdrop.mobileWidth,
    height: backdrop.mobileHeight,
  });

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
        <picture>
          <source
            media={BACKDROP_MOBILE_MEDIA}
            srcSet={mobile.srcSet}
            sizes={mobile.sizes}
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture>; sources come from getImageProps */}
          <img {...desktop} alt='' decoding='async' fetchPriority='high' />
        </picture>
      </div>
      <div className='homepage-editorial-hero__scrim' aria-hidden='true' />
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
