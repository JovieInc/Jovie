import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SECTION_TEST_IDS } from '@/data/artistProfilePageOrder';
import { ArtistProfileHero } from './ArtistProfileHero';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHeroAdaptiveIntroProps {
 readonly hero: ArtistProfileLandingCopy['hero'];
 readonly adaptive: ArtistProfileLandingCopy['adaptive'];
}

export function ArtistProfileHeroAdaptiveIntro({
 hero,
 adaptive,
}: Readonly<ArtistProfileHeroAdaptiveIntroProps>) {
 return (
 <div className='relative overflow-x-clip bg-base'>
 <div data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.hero}>
 <ArtistProfileHero hero={hero} />
 </div>

 <div
 data-testid={ARTIST_PROFILE_SECTION_TEST_IDS.adaptive}
 className='relative bg-base'
 >
 <ArtistProfileSectionShell
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
