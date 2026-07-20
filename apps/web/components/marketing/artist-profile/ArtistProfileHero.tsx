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
      className='homepage-hero homepage-hero--artist-profile relative overflow-hidden border-b border-subtle bg-black dark:bg-black'
      aria-labelledby='artist-profile-hero-heading'
    >
      <MarketingContainer
        width='page'
        className='relative !px-5 sm:!px-6 lg:!px-0'
      >
        <div className='mx-auto flex min-h-[72svh] max-w-3xl flex-col items-center justify-center pb-16 pt-[calc(var(--public-shell-header-offset)+4rem)] text-center sm:min-h-[76svh] sm:pb-20 lg:min-h-[80svh]'>
          <p className='mb-6 text-xs font-medium tracking-wide text-secondary-token'>
            {hero.eyebrow}
          </p>
          <h1
            id='artist-profile-hero-heading'
            className='max-w-[11ch] text-[clamp(3.125rem,7.15vw,5.625rem)] font-[660] leading-[0.95] tracking-[-0.055em] text-primary-token'
          >
            {hero.headline}
          </h1>
          <p className='mt-5 max-w-[37rem] text-[clamp(1rem,1.65vw,1.18rem)] leading-[1.58] tracking-[-0.02em] text-secondary-token'>
            {hero.subhead}
          </p>
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
