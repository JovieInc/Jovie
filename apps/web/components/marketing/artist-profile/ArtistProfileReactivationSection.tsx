import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileReactivationVisual } from '../MarketingStoryPrimitives';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileReactivationSection.css';

interface ArtistProfileReactivationSectionProps {
  readonly id?: string;
  readonly reactivation: ArtistProfileLandingCopy['reactivation'];
  readonly notification: ArtistProfileLandingCopy['capture']['notification'];
  readonly sectionId?: 'feature-split';
  readonly sectionVariant?: string;
  readonly sectionOwner?: string;
}

export function ArtistProfileReactivationSection({
  id,
  reactivation,
  notification,
  sectionId,
  sectionVariant,
  sectionOwner,
}: Readonly<ArtistProfileReactivationSectionProps>) {
  return (
    <ArtistProfileSectionShell
      className='overflow-hidden bg-(--color-bg-base)'
      id={id}
      width='page'
      sectionId={sectionId}
      sectionVariant={sectionVariant}
      sectionOwner={sectionOwner}
    >
      <div>
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
