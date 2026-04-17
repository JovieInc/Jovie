import { FaqSection } from '@/components/marketing';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileFaqProps {
  readonly faq: ArtistProfileLandingCopy['faq'];
}

export function ArtistProfileFaq({ faq }: Readonly<ArtistProfileFaqProps>) {
  return (
    <ArtistProfileSectionShell className='py-24 sm:py-28 lg:py-32'>
      <div className='mx-auto max-w-[760px]'>
        <FaqSection
          items={[...faq.items]}
          heading={faq.headline}
          className='px-0 pb-0'
          headingClassName='text-[clamp(2.15rem,3.8vw,3.1rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-primary-token'
        />
      </div>
    </ArtistProfileSectionShell>
  );
}
