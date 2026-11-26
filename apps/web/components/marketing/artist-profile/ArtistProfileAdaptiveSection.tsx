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
 * Canonical feature-split body: phone-framed mode switcher (phone-right).
 * Storybook / Marketing/Sections/feature-split still mounts this owner. The
 * live /solutions/artists hero embeds ArtistProfileModeSwitcher directly
 * (JOV-14242) so the page keeps one morphing mock.
 */
export function ArtistProfileAdaptiveSection({
  adaptive,
}: Readonly<ArtistProfileAdaptiveSectionProps>) {
  return (
    <ArtistProfileSectionShell
      sectionId='feature-split'
      sectionVariant='phone-right'
      sectionOwner='apps/web/components/marketing/artist-profile/ArtistProfileAdaptiveSection.tsx'
      sectionOccurrence='adaptive'
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
