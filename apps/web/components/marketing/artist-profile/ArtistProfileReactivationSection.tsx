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
 className='overflow-hidden bg-(--color-bg-base)'
 id={id}
 width='page'
 >
 <div className='mx-auto max-w-280'>
 <ArtistProfileSectionHeader
 align='center'
 headline={reactivation.headline}
 body={reactivation.subhead}
 className='max-w-xl'
 bodyClassName='mx-auto max-w-xl'
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
