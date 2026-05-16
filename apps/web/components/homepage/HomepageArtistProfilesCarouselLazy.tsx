'use client';

import dynamic from 'next/dynamic';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import type { HomepageArtistProfileCard } from './HomepageArtistProfilesCarousel';

// JOV-1835: `HomepageArtistProfilesCarousel` is a horizontally-scrollable
// client rail. Defer its JS chunk via a client-component shim
// (`ssr: false` is forbidden in Server Components in Next 15 App Router)
// so its hydration doesn't compete with above-the-fold work.
//
// The placeholder reuses the outer CSS classes (`.homepage-artist-profiles-section`,
// `__inner`, `__header`, `.homepage-artist-profiles-carousel`) plus a
// reserved rail min-height so the section height matches the real
// component and CLS stays at 0 when the chunk mounts.
const HomepageArtistProfilesCarouselImpl = dynamic(
  () =>
    import('./HomepageArtistProfilesCarousel').then(m => ({
      default: m.HomepageArtistProfilesCarousel,
    })),
  {
    ssr: false,
    loading: () => (
      <section
        aria-hidden='true'
        data-testid='homepage-artist-profiles-section-placeholder'
        className='homepage-artist-profiles-section'
      >
        <div className='homepage-artist-profiles-section__inner'>
          <div className='homepage-artist-profiles-section__header'>
            <h2 style={{ visibility: 'hidden' }}>
              <span>{HOMEPAGE_LAUNCH_COPY.artistProfiles.headline}</span>
              <span>{HOMEPAGE_LAUNCH_COPY.artistProfiles.headlineAccent}</span>
            </h2>
          </div>
          <div
            className='homepage-artist-profiles-carousel'
            style={{ minHeight: 'clamp(28rem, 56vw, 38rem)' }}
          />
        </div>
      </section>
    ),
  }
);

export function HomepageArtistProfilesCarouselLazy({
  cards,
}: Readonly<{ cards: readonly HomepageArtistProfileCard[] }>) {
  return <HomepageArtistProfilesCarouselImpl cards={cards} />;
}
