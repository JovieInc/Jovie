import { HomeHeroCTA } from '@/components/features/home/HomeHeroCTA';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MarketingContainer } from '../MarketingContainer';

interface ArtistProfileHeroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
}

export function ArtistProfileHero({ hero }: Readonly<ArtistProfileHeroProps>) {
  return (
    <section
      data-testid='homepage-hero'
      className='homepage-hero homepage-hero--artist-profile relative overflow-hidden border-b border-subtle bg-base'
      aria-labelledby='artist-profile-hero-heading'
    >
      <MarketingContainer width='page' className='relative px-5 sm:px-6 lg:px-0'>
        <div className='system-b-artist-profile-hero-stage'>
          <p className='mb-6 text-xs font-medium tracking-wide text-secondary-token'>
            {hero.eyebrow}
          </p>
          {/* ui-casing-allow: marketing display headline */}
          <h1
            id='artist-profile-hero-heading'
            className='system-b-artist-profile-hero-title'
          >
            {hero.headline}
          </h1>
          <p className='system-b-artist-profile-hero-subhead'>{hero.subhead}</p>
          <div className='mt-7 flex justify-center'>
            <HomeHeroCTA />
          </div>
          <p className='mt-5 font-mono text-xs tracking-tight text-tertiary-token'>
            {hero.signature}
          </p>
        </div>
      </MarketingContainer>
    </section>
  );
}
