// @coverage-via apps/web/tests/unit/marketing/component-registry.test.ts
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileHeroAdaptiveIntro.css';

interface ArtistProfileAdaptiveSectionProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

/**
 * Canonical feature-split body: the shipped /artist-profiles adaptive section
 * (phone-framed mode switcher, phone-right variant). Mounted exactly once by
 * the route (via ArtistProfileHeroAdaptiveIntro) and by the
 * Marketing/Sections/feature-split story so both render the identical body.
 */
export function ArtistProfileAdaptiveSection({
  adaptive,
}: Readonly<ArtistProfileAdaptiveSectionProps>) {
  return (
    <ArtistProfileSectionShell
      id='adaptive'
      className='ap-hero-intro__adaptive border-b border-subtle'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureSplit}
    >
      <div data-testid='artist-profile-adaptive-sequence'>
        <ArtistProfileModeSwitcher adaptive={adaptive} />
      </div>
    </ArtistProfileSectionShell>
  );
}
