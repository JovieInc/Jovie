'use client';

import {
  Disc3,
  ExternalLink,
  FileAudio2,
  FileText,
  ImageIcon,
  Music2,
  Search,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import { isFormElement } from '@/lib/utils/keyboard';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import {
  formatLibraryReleaseDate,
  type LibraryReleaseAsset,
} from './library-data';

const LIBRARY_LOADING_PLACEHOLDERS = [
  'library-loading-release-1',
  'library-loading-release-2',
  'library-loading-release-3',
  'library-loading-release-4',
  'library-loading-release-5',
  'library-loading-release-6',
] as const;

function formatReleaseType(type: LibraryReleaseAsset['releaseType']): string {
  return type.split('_').map(capitalizeFirst).join(' ');
}

function formatReleaseStatus(status: LibraryReleaseAsset['status']): string {
  return capitalizeFirst(status);
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

function assetMatchesSearch(asset: LibraryReleaseAsset, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    asset.title,
    asset.artist,
    asset.status,
    formatReleaseType(asset.releaseType),
    ...asset.providers.map(provider => provider.label),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

function LibrarySearchInput({
  value,
  onChange,
  inputRef,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}>) {
  return (
    <div className='flex h-8 min-w-0 items-center gap-2 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2.5 text-secondary-token transition-[border-color,background-color] focus-within:border-(--linear-border-focus) focus-within:bg-surface-1'>
      <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
      <input
        ref={inputRef}
        type='search'
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (value) {
              onChange('');
            } else {
              event.currentTarget.blur();
            }
          }
        }}
        aria-label='Search library assets'
        placeholder='Search assets, artists, providers'
        data-app-search-field='true'
        className='min-w-0 flex-1 bg-transparent text-[12.5px] text-primary-token outline-none placeholder:text-tertiary-token'
      />
      {value ? (
        <button
          type='button'
          onClick={() => onChange('')}
          aria-label='Clear library search'
          className='inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          <X className='h-3 w-3' />
        </button>
      ) : (
        <kbd className='hidden h-5 shrink-0 items-center rounded border border-(--linear-app-shell-border) bg-surface-1 px-1.5 text-[10px] font-semibold text-tertiary-token sm:inline-flex'>
          /
        </kbd>
      )}
    </div>
  );
}

export function LibraryLoadingState() {
  return (
    <main
      aria-busy='true'
      aria-label='Loading Library'
      className='h-full overflow-y-auto px-5 py-5 sm:px-6 lg:px-8'
    >
      <div className='mx-auto max-w-6xl space-y-5'>
        <div className='flex items-end justify-between gap-4'>
          <div className='space-y-2'>
            <div className='h-4 w-56 max-w-[72vw] rounded-md bg-surface-1' />
            <div className='h-4 w-32 rounded-md bg-surface-1' />
          </div>
          <div className='hidden h-4 w-20 rounded-md bg-surface-1 sm:block' />
        </div>

        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {LIBRARY_LOADING_PLACEHOLDERS.map(placeholderId => (
            <div
              key={placeholderId}
              className='min-w-0 rounded-lg border border-subtle bg-surface-0 p-3'
            >
              <div className='flex gap-3'>
                <div className='h-20 w-20 shrink-0 rounded-md bg-surface-1 sm:h-24 sm:w-24' />
                <div className='min-w-0 flex-1 space-y-3'>
                  <div className='space-y-2'>
                    <div className='h-4 w-3/4 rounded-md bg-surface-1' />
                    <div className='h-3 w-1/2 rounded-md bg-surface-1' />
                  </div>
                  <div className='grid grid-cols-2 gap-3'>
                    <div className='h-8 rounded-md bg-surface-1' />
                    <div className='h-8 rounded-md bg-surface-1' />
                  </div>
                </div>
              </div>
              <div className='mt-3 flex gap-1.5'>
                <div className='h-6 w-16 rounded-md bg-surface-1' />
                <div className='h-6 w-20 rounded-md bg-surface-1' />
                <div className='h-6 w-14 rounded-md bg-surface-1' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export function LibrarySurface({
  assets,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
}) {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleAssets = useMemo(
    () => assets.filter(asset => assetMatchesSearch(asset, search)),
    [assets, search]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key !== '/') return;
      if (isFormElement(event.target)) return;

      event.preventDefault();
      searchInputRef.current?.focus();
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  if (assets.length === 0) {
    return (
      <main
        aria-label='Library'
        className='flex h-full min-h-[420px] items-center justify-center px-6'
        data-testid='library-surface'
      >
        <div className='max-w-sm text-center'>
          <div className='mx-auto mb-4 grid h-10 w-10 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary-token'>
            <Music2 className='h-4 w-4' strokeWidth={2.25} />
          </div>
          <h2 className='text-base font-semibold text-primary-token'>
            No Release Assets
          </h2>
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
    <main
      aria-label='Library'
      className='h-full overflow-y-auto px-5 py-5 sm:px-6 lg:px-8'
      data-testid='library-surface'
    >
      <div className='mx-auto max-w-6xl space-y-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <p className='max-w-2xl text-sm text-secondary-token'>
            Read-only release assets from your connected catalog.
          </p>
          <div className='flex min-w-0 items-center gap-3 sm:min-w-[24rem]'>
            <div className='min-w-0 flex-1'>
              <LibrarySearchInput
                value={search}
                onChange={setSearch}
                inputRef={searchInputRef}
              />
            </div>
            <div className='hidden shrink-0 text-sm tabular-nums text-tertiary-token sm:block'>
              {visibleAssets.length}
              {visibleAssets.length === assets.length
                ? ''
                : ` of ${assets.length}`}{' '}
              {assets.length === 1 ? 'Release' : 'Releases'}
            </div>
          </div>
        </div>

        {visibleAssets.length === 0 ? (
          <div className='flex min-h-[300px] items-center justify-center rounded-lg border border-subtle bg-surface-0 px-6 text-center'>
            <div>
              <h2 className='text-base font-semibold text-primary-token'>
                No assets match your search
              </h2>
              <p className='mt-2 text-sm text-secondary-token'>
                Try a release title, artist, provider, status, or asset type.
              </p>
              <button
                type='button'
                onClick={() => setSearch('')}
                className='mt-4 inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color] hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {visibleAssets.map(asset => (
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
                    {asset.providerCount}{' '}
                    {asset.providerCount === 1 ? 'Provider' : 'Providers'}
                  </span>
                  {asset.hasArtwork ? (
                    <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                      <ImageIcon className='h-3 w-3' strokeWidth={2.25} />
                      Artwork
                    </span>
                  ) : null}
                  {asset.previewUrl ? (
                    <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                      <FileAudio2 className='h-3 w-3' strokeWidth={2.25} />
                      Preview
                    </span>
                  ) : null}
                  {asset.hasLyrics ? (
                    <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-2 py-1'>
                      <FileText className='h-3 w-3' strokeWidth={2.25} />
                      Lyrics
                    </span>
                  ) : null}
                </div>

                <div className='mt-3 flex flex-wrap items-center gap-1.5'>
                  <Link
                    href={asset.smartLinkPath}
                    className='inline-flex h-7 items-center gap-1 rounded-md border border-subtle bg-surface-0 px-2 text-xs font-medium text-primary-token transition-[background-color,border-color] hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
                  >
                    Open Release
                    <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
                  </Link>
                  {asset.previewUrl ? (
                    <a
                      href={asset.previewUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex h-7 items-center gap-1 rounded-md border border-subtle bg-surface-0 px-2 text-xs font-medium text-secondary-token transition-[background-color,border-color,color] hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
                    >
                      Open Preview
                      <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
                    </a>
                  ) : null}
                  {asset.providers.slice(0, 3).map(provider => (
                    <a
                      key={`${asset.id}-${provider.key}`}
                      href={provider.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex h-7 items-center gap-1 rounded-md border border-subtle bg-surface-0 px-2 text-xs font-medium text-secondary-token transition-[background-color,border-color,color] hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
                    >
                      {provider.label}
                      <ExternalLink className='h-3 w-3' strokeWidth={2.25} />
                    </a>
                  ))}
                  {asset.providerCount > 3 ? (
                    <span className='inline-flex h-7 items-center rounded-md bg-surface-1 px-2 text-xs text-tertiary-token'>
                      {asset.providerCount - 3} More
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
