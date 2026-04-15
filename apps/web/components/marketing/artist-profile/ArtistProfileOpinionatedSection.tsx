import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { ArtistProfilePlaceholderShot } from './ArtistProfilePlaceholderShot';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

export function ArtistProfileOpinionatedSection({
  opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  return (
    <ArtistProfileSectionShell className='bg-white/[0.01]'>
      <div className='grid gap-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:items-start'>
        <div>
          <h2 className='marketing-h2-linear max-w-[14ch] text-primary-token'>
            {opinionated.headline}
          </h2>
          <p className='mt-5 max-w-[36rem] text-[15px] leading-[1.7] text-secondary-token'>
            {opinionated.body}
          </p>
          <div className='mt-8 grid gap-3 sm:grid-cols-3'>
            {opinionated.principles.map(principle => (
              <div
                key={principle}
                className='rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-5 text-[14px] font-medium text-primary-token'
              >
                {principle}
              </div>
            ))}
          </div>
        </div>

        <div className='rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-4'>
          <div className='overflow-hidden rounded-[1.3rem] border border-white/8 bg-white/[0.02]'>
            <ArtistProfilePlaceholderShot variant='opinionated' />
          </div>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
