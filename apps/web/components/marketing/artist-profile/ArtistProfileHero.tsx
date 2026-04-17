import { HomeHeroCTA } from '@/components/features/home/HomeHeroCTA';
import { MarketingContainer } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';

interface ArtistProfileHeroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
}

export function ArtistProfileHero({ hero }: Readonly<ArtistProfileHeroProps>) {
  return (
    <section
      data-testid='homepage-hero'
      className='homepage-hero homepage-hero--artist-profile relative overflow-hidden border-b border-white/[0.03] bg-black'
      aria-labelledby='artist-profile-hero-heading'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.09),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_48%)]'
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(83,131,255,0.14),transparent_52%)]'
      />

      <MarketingContainer
        width='page'
        className='relative !max-w-[var(--linear-content-max)] !px-5 sm:!px-6 lg:!px-0'
      >
        <div className='mx-auto flex max-w-[48rem] flex-col items-center pb-10 pt-[calc(var(--linear-header-height)+3rem)] text-center sm:pb-12 sm:pt-[calc(var(--linear-header-height)+3.5rem)] lg:pb-14 lg:pt-[calc(var(--linear-header-height)+4rem)]'>
          <h1
            id='artist-profile-hero-heading'
            className='max-w-[9ch] text-[clamp(3.2rem,7.2vw,6.8rem)] font-semibold leading-[0.9] tracking-[-0.085em] text-primary-token'
          >
            {hero.headline}
          </h1>
          <p className='mt-5 max-w-[37rem] text-[clamp(1rem,1.65vw,1.18rem)] leading-[1.58] tracking-[-0.02em] text-secondary-token'>
            {hero.subhead}
          </p>
          <div className='mt-7 flex justify-center'>
            <HomeHeroCTA />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}
