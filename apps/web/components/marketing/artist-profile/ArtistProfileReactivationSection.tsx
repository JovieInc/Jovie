import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileReactivationVisual } from '../MarketingStoryPrimitives';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileReactivationSection.css';

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
      className='overflow-hidden bg-(--color-bg-base)'
      id={id}
      width='page'
    >
      <div className='mx-auto max-w-280'>
        <ArtistProfileSectionHeader
          align='center'
          headline={reactivation.headline}
          body={reactivation.subhead}
          bodyClassName='ap-reactivation__body'
        />
        <ArtistProfileReactivationVisual
          className='mt-10'
          notification={notification}
          reactivation={reactivation}
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
