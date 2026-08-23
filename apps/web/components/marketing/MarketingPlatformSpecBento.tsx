import Image from 'next/image';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  getShippedSiteImage,
  type JovieMarketingAccent,
  PLATFORM_SPEC_BENTO_COPY,
  PLATFORM_SPEC_TILES,
} from '@/data/marketingShowcaseSpecCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './artist-profile/ArtistProfileSectionShell';

import './MarketingPlatformSpecBento.css';

const TITLE_ACCENT_CLASS: Record<JovieMarketingAccent, string> = {
  blue: 'm-spec-bento__title--blue',
  pink: 'm-spec-bento__title--pink',
  purple: 'm-spec-bento__title--purple',
};

interface MarketingPlatformSpecBentoProps {
  readonly testId?: string;
}

export function MarketingPlatformSpecBento({
  testId = 'marketing-platform-spec-bento',
}: Readonly<MarketingPlatformSpecBentoProps>) {
  return (
    <ArtistProfileSectionShell
      className='m-spec-bento'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.specWall}
    >
      <div className='mx-auto max-w-public-content' data-testid={testId}>
        <ArtistProfileSectionHeader
          align='left'
          headline={PLATFORM_SPEC_BENTO_COPY.headline}
          body={PLATFORM_SPEC_BENTO_COPY.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <div className='m-spec-bento__grid mt-10'>
          {PLATFORM_SPEC_TILES.map(tile => {
            const image = getShippedSiteImage(tile.scenarioId);

            return (
              <article
                key={tile.id}
                data-testid='platform-spec-tile'
                data-accent={tile.accent}
                className={cn(
                  'flex min-h-52 flex-col overflow-hidden rounded-xl border border-subtle bg-surface-1 p-4',
                  tile.layoutClassName
                )}
              >
                <div
                  className={cn(
                    'm-spec-bento__stage relative overflow-hidden rounded-lg',
                    tile.kind === 'phone' && 'm-spec-bento__stage--phone'
                  )}
                >
                  <Image
                    fill
                    src={image.publicUrl}
                    alt={tile.alt}
                    className='object-contain object-top'
                    sizes='(min-width: 1280px) 40vw, (min-width: 768px) 45vw, 92vw'
                  />
                </div>
                <div className='relative z-10 mt-4 max-w-sm'>
                  <h3
                    className={cn(
                      'text-base font-semibold tracking-tight',
                      TITLE_ACCENT_CLASS[tile.accent]
                    )}
                  >
                    {tile.title}
                  </h3>
                  <p className='mt-2 text-app leading-relaxed text-secondary-token'>
                    {tile.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
