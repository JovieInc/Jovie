import { FaqSection } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFaqProps {
  readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='mx-auto max-w-[760px]'>
        <FaqSection
          items={[...faq.items]}
          heading={faq.headline}
          className='px-0 pb-0'
          headingClassName='text-[clamp(2.7rem,5.25vw,4.6rem)] font-[650] leading-[0.94] tracking-[-0.072em] text-primary-token'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
