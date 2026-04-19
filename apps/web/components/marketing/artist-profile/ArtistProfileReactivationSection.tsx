import { ArtistProfileReactivationVisual } from '@/components/marketing/MarketingStoryPrimitives';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileReactivationSectionProps {
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
  readonly id?: string;
}

export function ArtistProfileReactivationSection({
  reactivation,
  notification,
  id,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      id={id}
      className='overflow-hidden bg-[#040506] py-24 sm:py-28 lg:py-32'
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
