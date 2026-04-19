import { HomeHero } from '@/components/features/home/HomeAdaptiveProfileStory';
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import { MarketingContainer } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';

interface ArtistProfileHeroAdaptiveIntroProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

export function ArtistProfileHeroAdaptiveIntro({
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileHeroAdaptiveIntroProps>) {
  return (
    <div className='relative overflow-x-clip bg-black'>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <HomeHero showPhoneComposition={false} variant='artist-profile' />
      </div>

      <div
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
        className='relative -mt-16 bg-black pb-16 sm:-mt-20 sm:pb-10 lg:-mt-24 lg:pb-12'
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

      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.trust}>
        <HomeTrustSection variant='compact' />
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
            min-height: calc(100svh + 17rem);
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
