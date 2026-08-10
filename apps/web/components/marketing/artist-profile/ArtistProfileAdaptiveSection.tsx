import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileHeroAdaptiveIntro.css';

interface ArtistProfileAdaptiveSectionProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

export const ARTIST_PROFILE_ADAPTIVE_VARIANT = 'phone-right' as const;

export function ArtistProfileAdaptiveSection({
  adaptive,
}: Readonly<ArtistProfileAdaptiveSectionProps>) {
  return (
    <div
      data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
      data-marketing-section='feature-split'
      data-feature-split-variant={ARTIST_PROFILE_ADAPTIVE_VARIANT}
      className='ap-hero-intro__adaptive relative'
    >
      <ArtistProfileSectionShell
        id='adaptive'
        className='border-b border-subtle'
      >
        <div data-testid='artist-profile-adaptive-sequence'>
          <ArtistProfileModeSwitcher adaptive={adaptive} />
        </div>
      </ArtistProfileSectionShell>
    </div>
  );
}
