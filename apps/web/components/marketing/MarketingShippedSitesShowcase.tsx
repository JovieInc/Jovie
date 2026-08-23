import Image from 'next/image';
import Link from 'next/link';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  getShippedSiteImage,
  SHIPPED_SITE_TILES,
  SHIPPED_SITES_SHOWCASE_COPY,
} from '@/data/marketingShowcaseSpecCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './artist-profile/ArtistProfileSectionShell';

import './MarketingShippedSitesShowcase.css';

interface MarketingShippedSitesShowcaseProps {
  readonly testId?: string;
}

export function MarketingShippedSitesShowcase({
  testId = 'marketing-shipped-sites-showcase',
}: Readonly<MarketingShippedSitesShowcaseProps>) {
  return (
    <ArtistProfileSectionShell
      className='m-shipped-sites'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.socialProof}
    >
      <div className='mx-auto max-w-public-content' data-testid={testId}>
        <ArtistProfileSectionHeader
          align='left'
          headline={SHIPPED_SITES_SHOWCASE_COPY.headline}
          body={SHIPPED_SITES_SHOWCASE_COPY.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />

        <div className='m-shipped-sites__grid mt-10'>
          {SHIPPED_SITE_TILES.map(tile => {
            const image = getShippedSiteImage(tile.scenarioId);
            const shot = (
              <article>
                <div
                  className={cn(
                    'm-shipped-sites__frame relative overflow-hidden rounded-xl border border-subtle',
                    tile.kind === 'desktop' && 'm-shipped-sites__frame--desktop'
                  )}
                >
                  <Image
                    fill
                    src={image.publicUrl}
                    alt={tile.alt}
                    className='object-contain object-top'
                    sizes='(min-width: 1280px) 28vw, (min-width: 640px) 45vw, 92vw'
                  />
                </div>
                <div className='mt-4 flex items-baseline justify-between gap-3 border-t border-subtle pt-3'>
                  <div className='min-w-0'>
                    <h3 className='truncate text-sm font-semibold text-primary-token'>
                      {tile.name}
                    </h3>
                    <p className='mt-1 truncate font-mono text-xs text-tertiary-token'>
                      {tile.handle}
                    </p>
                  </div>
                  <p className='shrink-0 text-xs text-secondary-token'>
                    {tile.label}
                  </p>
                </div>
              </article>
            );

            if (tile.href) {
              return (
                <Link
                  key={tile.id}
                  href={tile.href}
                  data-testid='shipped-site-tile'
                  className='focus-ring-themed block rounded-xl'
                >
                  {shot}
                </Link>
              );
            }

            return (
              <div key={tile.id} data-testid='shipped-site-tile'>
                {shot}
              </div>
            );
          })}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
