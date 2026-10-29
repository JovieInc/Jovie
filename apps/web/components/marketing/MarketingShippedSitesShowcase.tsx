import Link from 'next/link';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import {
  PROFILE_STATE_TILES,
  type ProfileStateTile,
  SHIPPED_SITES_SHOWCASE_COPY,
} from '@/data/marketingShowcaseSpecCopy';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './artist-profile/ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './artist-profile/ArtistProfileSectionShell';
import { ProductScreenshotFrame } from './ProductScreenshotFrame';

import './MarketingShippedSitesShowcase.css';

interface MarketingShippedSitesShowcaseProps {
  readonly testId?: string;
}

function ProfileStateCard({
  tile,
  className,
}: Readonly<{ tile: ProfileStateTile; className?: string }>) {
  return (
    <article
      data-testid='shipped-site-tile'
      className={cn('m-shipped-sites__item', className)}
    >
      <ProductScreenshotFrame
        scenarioId={tile.scenarioId}
        device='phone'
        altOverride={tile.alt}
        focus={null}
        sizes='(min-width: 1280px) 30vw, (min-width: 768px) 44vw, 92vw'
        className='m-shipped-sites__frame'
      />
      <div className='m-shipped-sites__caption'>
        <h3 className='text-balance text-base font-semibold text-primary-token'>
          {tile.title}
        </h3>
        <p className='mt-1 text-pretty text-sm text-secondary-token'>
          {tile.body}
        </p>
      </div>
    </article>
  );
}

/**
 * Profile states, one idea per tile: the real component that changes in that
 * state is the whole shot (screenshot catalog `profile-state-*`). Three larger
 * tiles replace the old six-phone wall that repeated the identity header.
 */
export function MarketingShippedSitesShowcase({
  testId = 'marketing-shipped-sites-showcase',
}: Readonly<MarketingShippedSitesShowcaseProps>) {
  const [lead, ...rest] = PROFILE_STATE_TILES;
  return (
    <ArtistProfileSectionShell
      sectionId='product-gallery'
      sectionVariant='profile-grid'
      sectionOwner='apps/web/components/marketing/MarketingShippedSitesShowcase.tsx'
      sectionOccurrence='product-examples'
      className='m-shipped-sites'
      penContractId={MARKETING_PEN_CONTRACT_IDS.section.productGallery}
    >
      <div className='mx-auto max-w-public-content' data-testid={testId}>
        <ArtistProfileSectionHeader
          align='left'
          headline={SHIPPED_SITES_SHOWCASE_COPY.headline}
          body={SHIPPED_SITES_SHOWCASE_COPY.body}
          className='max-w-3xl'
          bodyClassName='max-w-xl'
        />
        <Link
          href={SHIPPED_SITES_SHOWCASE_COPY.liveProfileHref}
          className='focus-ring-themed mt-4 inline-flex text-sm text-secondary-token underline-offset-4 hover:text-primary-token hover:underline'
        >
          {SHIPPED_SITES_SHOWCASE_COPY.liveProfileLabel}
        </Link>

        <div className='m-shipped-sites__grid mt-10'>
          {lead ? (
            <ProfileStateCard tile={lead} className='m-shipped-sites__lead' />
          ) : null}
          {rest.map(tile => (
            <ProfileStateCard key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
