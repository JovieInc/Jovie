import { HomeHeroCTA } from '@/components/features/home/HomeHeroCTA';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MarketingContainer } from '../MarketingContainer';
import './ArtistProfileHero.css';

interface ArtistProfileHeroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
}

export function ArtistProfileHero({ hero }: Readonly<ArtistProfileHeroProps>) {
  return (
    <section
      data-testid='homepage-hero'
      className='ap-hero homepage-hero homepage-hero--artist-profile relative overflow-hidden border-b border-subtle'
      aria-labelledby='artist-profile-hero-heading'
    >
      <div
        aria-hidden='true'
        className='ap-hero__atmosphere pointer-events-none absolute inset-0'
      />
      <MarketingContainer
        width='page'
        className='relative !px-5 sm:!px-6 lg:!px-0'
      >
        <div className='ap-hero__inner mx-auto flex max-w-3xl flex-col items-center justify-center pb-16 text-center sm:pb-20'>
          {/* ui-casing-allow: marketing display headline */}
          <h1
            id='artist-profile-hero-heading'
            className='ap-hero__title text-primary-token'
          >
            {hero.headline}
          </h1>
          <p className='ap-hero__subhead mt-5 text-secondary-token'>
            {hero.subhead}
          </p>
          <div className='ap-hero__focal mt-8 flex w-full justify-center'>
            <HomeHeroCTA section='artist-profiles-hero' showSupport />
          </div>
          <p className='mt-4 font-mono text-xs tracking-tight text-tertiary-token'>
            {hero.signature}
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
