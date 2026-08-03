import Image from 'next/image';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}

const SYNC_SETTINGS = getMarketingExportImage(
  'artist-spec-sync-settings-desktop'
);

export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='mx-auto grid max-w-public-content items-start gap-12 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(36rem,1.28fr)] lg:gap-16'>
        <div>
          <ArtistProfileSectionHeader
            align='left'
            headline={howItWorks.headline}
            body={howItWorks.body}
            className='max-w-xl'
            bodyClassName='max-w-md'
          />

          <ol className='mt-9 border-t border-subtle'>
            {howItWorks.steps.map((step, index) => (
              <li
                key={step.id}
                className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-subtle py-5'
              >
                <span className='font-mono text-3xs text-tertiary-token'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className='text-sm font-semibold text-primary-token'>
                    {step.title}
                  </h3>
                  <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <figure className='ap-how-it-works__product-window relative overflow-hidden border border-subtle bg-surface-0'>
          <div className='ap-how-it-works__window-bar flex items-center gap-2 border-b border-subtle px-4 py-3'>
            <span aria-hidden='true' />
            <span aria-hidden='true' />
            <span aria-hidden='true' />
            <figcaption className='ml-2 font-mono text-3xs text-tertiary-token'>
              Connect Music
            </figcaption>
          </div>
          <div className='relative aspect-[1.2875]'>
            <Image
              fill
              src={SYNC_SETTINGS.publicUrl}
              alt='Jovie settings showing music services connected to an artist profile.'
              className='object-cover object-top'
              sizes='(min-width: 1024px) 48rem, 100vw'
            />
          </div>
        </figure>
      </div>
    </ArtistProfileSectionShell>
  );
}
