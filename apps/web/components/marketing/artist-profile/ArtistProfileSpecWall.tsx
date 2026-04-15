import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileFeatureTile } from '@/data/artistProfileFeatures';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileSpecWallProps {
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly tiles: readonly ArtistProfileFeatureTile[];
}

export function ArtistProfileSpecWall({
  specWall,
  tiles,
}: Readonly<ArtistProfileSpecWallProps>) {
  return (
    <ArtistProfileSectionShell>
      <div className='flex flex-wrap items-end justify-between gap-6'>
        <div>
          <h2 className='marketing-h2-linear max-w-[14ch] text-primary-token'>
            {specWall.headline}
          </h2>
          <p className='mt-5 max-w-[38rem] text-[15px] leading-[1.7] text-secondary-token'>
            {specWall.lead}
          </p>
        </div>
        <Link
          href={APP_ROUTES.SIGNUP}
          className='text-[13px] font-medium text-secondary-token transition-colors hover:text-primary-token'
        >
          {specWall.claimLinkLabel}
        </Link>
      </div>

      <div className='mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {tiles.map(tile => (
          <article
            key={tile.id}
            className='rounded-[1.2rem] bg-white/[0.03] px-4 py-4'
          >
            <h3 className='text-[14px] font-medium text-primary-token'>
              {tile.title}
            </h3>
            <p className='mt-2 text-[12px] leading-[1.55] text-secondary-token'>
              {tile.body}
            </p>
          </article>
        ))}
      </div>
    </ArtistProfileSectionShell>
  );
}
