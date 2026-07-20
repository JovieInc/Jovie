'use client';

import type {
  ArtistProfileCaptureVisualCopy,
  ArtistProfileLandingCopy,
} from '@/data/artistProfileCopy';
import { ArtistProfileCaptureVisual } from '../MarketingStoryPrimitives';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileCaptureSectionProps {
  readonly id?: string;
  readonly capture:
    | ArtistProfileCaptureVisualCopy
    | ArtistProfileLandingCopy['capture'];
}

export function ArtistProfileCaptureSection({
  id,
  capture,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.012]' id={id}>
      <div className='mx-auto max-w-280'>
        <ArtistProfileSectionHeader
          align='center'
          headline={capture.headline}
          body={capture.subhead}
          className='max-w-[46rem]'
          bodyClassName='mx-auto max-w-[34rem]'
        />

        <ArtistProfileCaptureVisual capture={capture} className='mt-10' />
      </div>
    </ArtistProfileSectionShell>
  );
}
