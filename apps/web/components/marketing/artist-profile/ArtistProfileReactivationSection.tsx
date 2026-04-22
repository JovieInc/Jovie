import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileReactivationVisual } from '../MarketingStoryPrimitives';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileReactivationSectionProps {
  readonly id?: string;
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
}

export function ArtistProfileReactivationSection({
  id,
  reactivation,
  notification,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      className='overflow-hidden bg-[#040506] py-24 sm:py-28 lg:py-32'
      id={id}
      width='page'
    >
      <div className='mx-auto max-w-[1120px]'>
        <ArtistProfileSectionHeader
          align='center'
          headline={reactivation.headline}
          body={reactivation.subhead}
          className='max-w-[46rem]'
          bodyClassName='mx-auto max-w-[35rem]'
        />
        <ArtistProfileReactivationVisual
          className='mt-12'
          notification={notification}
          reactivation={reactivation}
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
