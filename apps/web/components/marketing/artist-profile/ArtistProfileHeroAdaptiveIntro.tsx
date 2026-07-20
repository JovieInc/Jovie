import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { MarketingContainer } from '../MarketingContainer';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';

interface ArtistProfileHeroAdaptiveIntroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

export function ArtistProfileHeroAdaptiveIntro({
  hero,
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileHeroAdaptiveIntroProps>) {
  return (
    <div className='artist-profile-hero-adaptive-intro relative overflow-x-clip bg-black dark:bg-black'>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <ArtistProfileHero hero={hero} />
      </div>

      <div
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
        className='relative bg-black dark:bg-black pb-[4.5rem] pt-2 sm:pb-10 sm:pt-4 lg:pb-12 lg:pt-6'
      >
        <MarketingContainer
          width='page'
          className='relative !max-w-(--linear-content-max) !px-5 sm:!px-6 lg:!px-0'
        >
          <div className='artist-profile-intro-stage'>
            <div className='artist-profile-intro-rail'>
              <div data-testid='artist-profile-adaptive-sequence'>
                <ArtistProfileModeSwitcher
                  adaptive={adaptive}
                  phoneCaption={phoneCaption}
                  phoneSubcaption={phoneSubcaption}
                />
              </div>
            </div>
          </div>
        </MarketingContainer>
      </div>

      <div
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.trust}
        className='artist-profile-intro-trust relative z-30 lg:-mt-28 xl:-mt-32'
      >
        <HomeTrustSection label='Trusted By Artists' />
      </div>

      <style>{`
        .artist-profile-intro-stage {
          position: relative;
        }

        .artist-profile-intro-rail {
          position: relative;
        }

        @media (min-width: 768px) and (min-height: 821px) {
          .artist-profile-intro-stage {
            min-height: calc(100svh + 2rem);
          }

          .artist-profile-intro-rail {
            position: sticky;
            top: clamp(
              calc(var(--linear-header-height) + 1.5rem),
              12svh,
              calc(var(--linear-header-height) + 4rem)
            );
          }
        }

        @media (min-width: 1024px) and (min-height: 821px) {
          .artist-profile-intro-stage {
            min-height: calc(100svh + 4rem);
          }

          .artist-profile-intro-rail {
            top: clamp(
              calc(var(--linear-header-height) + 2rem),
              14svh,
              calc(var(--linear-header-height) + 6rem)
            );
          }
        }

        @media (min-width: 1024px) and (max-height: 820px) {
          .artist-profile-hero-adaptive-intro {
            --artist-profile-intro-scroll-reserve: 44rem;
          }

          .artist-profile-intro-stage::after {
            /* A real flow child, rather than padding, extends sticky's
             * containing block through the trust handoff. */
            content: '';
            display: block;
            height: var(--artist-profile-intro-scroll-reserve);
          }

          .artist-profile-intro-rail {
            position: sticky;
            top: 1rem;
          }

          .artist-profile-intro-trust {
            /* The rail's reserve keeps its pinned phone behind the trust
             * handoff; the matching negative margin keeps downstream
             * sections in their stable document positions. */
            margin-top: calc(-3rem - var(--artist-profile-intro-scroll-reserve));
          }
        }
      `}</style>
    </div>
  );
}
