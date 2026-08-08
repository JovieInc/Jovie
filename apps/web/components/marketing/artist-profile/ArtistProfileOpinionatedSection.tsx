import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { cn } from '@/lib/utils';
import { SHELL_H2_CLASS, SHELL_LEAD_CLASS } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';
import './ArtistProfileOpinionatedSection.css';

interface ArtistProfileOpinionatedSectionProps {
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
}

const LIVE_PROFILE = getMarketingExportImage('tim-white-profile-live-mobile');

export function ArtistProfileOpinionatedSection({
  opinionated,
}: Readonly<ArtistProfileOpinionatedSectionProps>) {
  return (
    <ArtistProfileSectionShell className='ap-opinionated bg-surface-0'>
      <div className='mx-auto max-w-public-content'>
        <div className='grid items-center gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(26rem,1fr)] lg:gap-20'>
          <div className='max-w-2xl'>
            <h2 className={cn(SHELL_H2_CLASS, 'ap-opinionated__headline')}>
              {opinionated.headline}
            </h2>
            <p className={cn(SHELL_LEAD_CLASS, 'mt-6 max-w-xl')}>
              {opinionated.body}
            </p>
            <p className='mt-8 font-mono text-xs text-tertiary-token'>
              {opinionated.principle}
            </p>
          </div>

          <figure
            className='ap-opinionated__visual relative'
            data-testid='artist-profile-opinionated-profile'
          >
            <figcaption className='sr-only'>
              A Jovie artist profile leads fans to the current release with one
              Listen action.
            </figcaption>
            <Image
              fill
              src={LIVE_PROFILE.publicUrl}
              alt='Jovie artist profile leading with one clear Listen action.'
              className='object-contain object-center'
              sizes='(min-width: 1024px) 36rem, 86vw'
            />
          </figure>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
