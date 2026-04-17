import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileModeSwitcher } from './ArtistProfileModeSwitcher';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileAdaptiveSequenceProps {
  readonly adaptive: ArtistProfileLandingCopy['adaptive'];
  readonly phoneCaption: string;
  readonly phoneSubcaption: string;
}

export function ArtistProfileAdaptiveSequence({
  adaptive,
  phoneCaption,
  phoneSubcaption,
}: Readonly<ArtistProfileAdaptiveSequenceProps>) {
  return (
    <ArtistProfileSectionShell
      className='relative z-10 -mt-28 bg-white/[0.012] py-0 sm:-mt-32 lg:-mt-36'
      containerClassName='max-w-none px-0'
    >
      <div data-testid='artist-profile-adaptive-sequence'>
        <ArtistProfileModeSwitcher
          adaptive={adaptive}
          phoneCaption={phoneCaption}
          phoneSubcaption={phoneSubcaption}
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
