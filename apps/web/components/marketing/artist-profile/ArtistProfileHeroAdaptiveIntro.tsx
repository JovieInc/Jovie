import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingContainer } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
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
    <div className='relative overflow-x-clip bg-black'>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <ArtistProfileHero hero={hero} />
      </div>

      <div
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
        className='relative bg-black pb-16 pt-2 sm:pb-10 sm:pt-4 lg:pb-12 lg:pt-6'
      >
        <MarketingContainer
          width='page'
          className='relative !max-w-[var(--linear-content-max)] !px-5 sm:!px-6 lg:!px-0'
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
        className='relative z-30 lg:-mt-28 xl:-mt-32'
      >
        <HomeTrustSection label='Trusted by Artists' />
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
            min-height: calc(100svh + 14rem);
          }

          .artist-profile-intro-rail {
            position: sticky;
            top: clamp(
              calc(var(--linear-header-height) + 1.5rem),
              16svh,
              calc(var(--linear-header-height) + 6rem)
            );
          }
        }

        @media (min-width: 1024px) and (min-height: 821px) {
          .artist-profile-intro-stage {
            min-height: calc(100svh + 24rem);
          }

          .artist-profile-intro-rail {
            top: clamp(
              calc(var(--linear-header-height) + 2rem),
              18svh,
              calc(var(--linear-header-height) + 8rem)
            );
          }
        }
      `}</style>
    </div>
  );
}
