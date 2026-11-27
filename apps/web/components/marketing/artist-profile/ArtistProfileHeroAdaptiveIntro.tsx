// @coverage-via apps/web/components/marketing/artist-profile/ArtistProfileSectionBindings.test.tsx
import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import {
  type LogoPlacement,
  permittedLogoAssetIds,
} from '@/data/product-truth/logo-permissions';
import { ArtistProfileHero } from './ArtistProfileHero';
import './ArtistProfileHeroAdaptiveIntro.css';

interface ArtistProfileHeroAdaptiveIntroProps {
  readonly hero: ArtistProfileLandingCopy['hero'];
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  /** Route this intro renders on; logos render only with a permission. */
  readonly logoPlacement: LogoPlacement;
}

/**
 * Section 1 of the six-section artist LP: left-aligned homepage-system hero
 * with one mode-morphing profile mock (no duplicate phones below).
 */
export function ArtistProfileHeroAdaptiveIntro({
  hero,
  adaptive,
  logoPlacement,
}: Readonly<ArtistProfileHeroAdaptiveIntroProps>) {
  const showLogos = permittedLogoAssetIds(logoPlacement).length > 0;

  return (
    <div className='ap-hero-intro relative overflow-x-clip'>
      <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
        <ArtistProfileHero hero={hero} adaptive={adaptive} />
      </div>

      {showLogos ? (
        <div className='homepage-trust-section system-b-mounted-home-trust-strip-shell'>
          <HomeTrustSection
            placement={logoPlacement}
            ariaLabel='Artist distribution across leading music companies'
            label='Built For Artists And Teams Releasing Through'
            presentation='inline-strip'
            sectionVariant='inline-strip'
          />
        </div>
      ) : null}
    </div>
  );
}
