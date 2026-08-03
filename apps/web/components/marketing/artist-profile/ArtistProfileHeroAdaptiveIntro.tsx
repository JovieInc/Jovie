import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileHeroAdaptiveIntro.css';

interface ArtistProfileHeroAdaptiveIntroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

export function ArtistProfileHeroAdaptiveIntro({
  hero,
  adaptive,
}: Readonly<ArtistProfileHeroAdaptiveIntroProps>) {
  return (
    <div className='ap-hero-intro relative overflow-x-clip'>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <ArtistProfileHero hero={hero} />
      </div>

      <div className='homepage-trust-section system-b-mounted-home-trust-strip-shell'>
        <HomeTrustSection
          ariaLabel='Artist distribution across leading music companies'
          label='Built For Artists And Teams Releasing Through'
          presentation='inline-strip'
        />
      </div>

      <div
        data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
        className='ap-hero-intro__adaptive relative'
      >
        <ArtistProfileSectionShell
          id='adaptive'
          className='border-b border-subtle'
          containerClassName='!px-5 sm:!px-6 lg:!px-0'
        >
          <div data-testid='artist-profile-adaptive-sequence'>
            <ArtistProfileModeSwitcher adaptive={adaptive} />
          </div>
        </ArtistProfileSectionShell>
      </div>
    </div>
  );
}
