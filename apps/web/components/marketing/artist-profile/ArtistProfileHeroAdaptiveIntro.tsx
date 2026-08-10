import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ArtistProfileAdaptiveSection } from './ArtistProfileAdaptiveSection';
import { ArtistProfileHero } from './ArtistProfileHero';
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

      <ArtistProfileAdaptiveSection adaptive={adaptive} />
    </div>
  );
}
