import { Disc3, FileText, ImageIcon, Music2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import {
  formatLibraryReleaseDate,
  type LibraryReleaseAsset,
} from './library-data';

function formatReleaseType(type: LibraryReleaseAsset['releaseType']): string {
  return type
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatReleaseStatus(status: LibraryReleaseAsset['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Artwork({ asset }: { readonly asset: LibraryReleaseAsset }) {
  if (asset.artworkUrl) {
    return (
      <Image
        src={asset.artworkUrl}
        alt=''
        width={104}
        height={104}
        className='h-20 w-20 rounded-md object-cover sm:h-24 sm:w-24'
        unoptimized
      />
    );
  }

  return (
    <div className='grid h-20 w-20 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary-token sm:h-24 sm:w-24'>
      <ImageIcon className='h-5 w-5' strokeWidth={2.25} />
    </div>
  );
}

export function LibrarySurface({
  assets,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
}) {
  if (assets.length === 0) {
    return (
      <main className='flex h-full min-h-[420px] items-center justify-center px-6'>
        <div className='max-w-sm text-center'>
          <div className='mx-auto mb-4 grid h-10 w-10 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary-token'>
            <Music2 className='h-4 w-4' strokeWidth={2.25} />
          </div>
          <h1 className='text-lg font-semibold text-primary-token'>Library</h1>
          <p className='mt-2 text-sm leading-6 text-secondary-token'>
            Releases and artwork will appear here after your catalog is
            connected.
          </p>
          <Link
            href={APP_ROUTES.DASHBOARD_RELEASES}
            className='mt-5 inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color] hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
          >
            Open Releases
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className='h-full overflow-y-auto px-5 py-5 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <div className='flex items-end justify-between gap-4'>
          <div>
            <h1 className='text-xl font-semibold tracking-[-0.01em] text-primary-token'>
              Library
            </h1>
            <p className='mt-1 text-sm text-secondary-token'>
              Read-only release assets from your connected catalog.
            </p>
          </div>
          <div className='hidden text-sm tabular-nums text-tertiary-token sm:block'>
            {assets.length} {assets.length === 1 ? 'Release' : 'Releases'}
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {assets.map(asset => (
            <article
              key={asset.id}
              className='min-w-0 rounded-lg border border-subtle bg-surface-0 p-3'
            >
              <div className='flex gap-3'>
                <Artwork asset={asset} />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-start gap-2'>
                    <div className='min-w-0 flex-1'>
                      <h2 className='truncate text-sm font-semibold text-primary-token'>
                        {asset.title}
                      </h2>
                      <p className='mt-0.5 truncate text-xs text-secondary-token'>
                        {asset.artist}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] leading-4',
                        asset.status === 'released'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-subtle bg-surface-1 text-tertiary-token'
                      )}
                    >
                      {formatReleaseStatus(asset.status)}
                    </span>
                  </div>

                  <dl className='mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs'>
                    <div>
                      <dt className='text-tertiary-token'>Date</dt>
                      <dd className='mt-0.5 truncate text-primary-token'>
                        {formatLibraryReleaseDate(asset.releaseDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-tertiary-token'>Type</dt>
                      <dd className='mt-0.5 truncate text-primary-token'>
                        {formatReleaseType(asset.releaseType)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className='mt-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary-token'>
                <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                  <Disc3 className='h-3 w-3' strokeWidth={2.25} />
                  {asset.trackCount}{' '}
                  {asset.trackCount === 1 ? 'Track' : 'Tracks'}
                </span>
                <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                  <Music2 className='h-3 w-3' strokeWidth={2.25} />
                  {asset.providerCount} Providers
                </span>
                {asset.hasLyrics ? (
                  <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                    <FileText className='h-3 w-3' strokeWidth={2.25} />
                    Lyrics
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
