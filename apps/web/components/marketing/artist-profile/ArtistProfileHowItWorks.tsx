import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]'>
      <div className='max-w-[40rem]'>
        <h2 className='marketing-h2-linear text-primary-token'>
          {howItWorks.headline}
        </h2>
        <p className='mt-5 text-[15px] leading-[1.7] text-secondary-token'>
          {howItWorks.body}
        </p>
      </div>

      <div className='mt-10 grid gap-4 lg:grid-cols-3'>
        {howItWorks.steps.map((step, index) => (
          <article
            key={step.id}
            className='rounded-[1.25rem] bg-white/[0.025] p-5'
          >
            <p className='text-[12px] font-medium tracking-[-0.01em] text-tertiary-token'>
              0{index + 1}
            </p>
            <h3 className='mt-3 text-[17px] font-medium text-primary-token'>
              {step.title}
            </h3>
            <p className='mt-3 text-[14px] leading-[1.65] text-secondary-token'>
              {step.description}
            </p>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}
