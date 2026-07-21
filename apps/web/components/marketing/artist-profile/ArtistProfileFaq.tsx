import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { FaqSection } from '../FaqSection';
import { SHELL_H2_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFaqProps {
 readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
 return (
 <ArtistProfileSectionShell>
 <div className='mx-auto max-w-190'>
 <FaqSection
 items={[...faq.items]}
 heading={faq.headline}
 className='px-0 pb-0'
 headingClassName={SHELL_H2_CLASS}
 />
 </div>
 </ArtistProfileSectionShell>
 );
}
