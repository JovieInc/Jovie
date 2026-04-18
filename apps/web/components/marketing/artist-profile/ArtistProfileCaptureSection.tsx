'use client';

import { ArtistProfileCaptureVisual } from '@/components/marketing/MarketingStoryPrimitives';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileCaptureSectionProps {
  readonly capture: ArtistProfileLandingCopy['capture'];
  readonly id?: string;
}

export function ArtistProfileCaptureSection({
  capture,
  id,
}: Readonly<ArtistProfileCaptureSectionProps>) {
  return (
    <ArtistProfileSectionShell
      id={id}
      className='bg-white/[0.008] py-24 sm:py-28 lg:py-32'
    >
      <div className='mx-auto max-w-[1120px]'>
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
