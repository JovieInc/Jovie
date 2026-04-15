import { FaqSection } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFaqProps {
  readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
  return (
    <ArtistProfileSectionShell width='prose' containerClassName='max-w-[760px]'>
      <FaqSection
        items={[...faq.items]}
        heading={faq.headline}
        className='px-0 pb-0'
        headingClassName='marketing-h2-linear text-primary-token'
        singleOpen
      />
    </ArtistProfileSectionShell>
  );
}
