'use client';

import { useMemo } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import {
  PROFILE_DRAWER_META_CLASS,
  PROFILE_DRAWER_TITLE_CLASS,
} from '../profile-drawer-classes';
import type { PublicRelease } from '../releases/types';

const YEAR_HEADER_THRESHOLD = 15;

function formatReleaseType(type: string): string {
  switch (type) {
    case 'single':
      return 'Single';
    case 'ep':
      return 'EP';
    case 'album':
      return 'Album';
    case 'compilation':
      return 'Compilation';
    case 'live':
      return 'Live';
    case 'mixtape':
      return 'Mixtape';
    case 'music_video':
      return 'Video';
    default:
      return 'Release';
  }
}

export interface ReleasesViewProps {
  readonly releases: readonly PublicRelease[];
  readonly artistHandle: string;
  readonly artistName: string;
}

/**
 * Body of the `releases` mode: discography rows grouped by year.
 *
 * Pure view component — no title or shell. Year-header grouping only
 * activates when there are enough releases across multiple years to make
 * the separation useful (see `YEAR_HEADER_THRESHOLD`).
 */
export function ReleasesView({
  releases,
  artistHandle,
  artistName,
}: ReleasesViewProps) {
  const ownerNameLower = artistName.toLowerCase();

  const yearHeaderSet = useMemo(() => {
    const years = new Set(
      releases
        .map(r =>
          r.releaseDate
            ? new Date(r.releaseDate).getUTCFullYear().toString()
            : null
        )
        .filter(Boolean)
    );
    if (releases.length < YEAR_HEADER_THRESHOLD || years.size < 2) {
      return new Set<string>();
    }
    const headers = new Set<string>();
    let prev: string | null = null;
    for (const release of releases) {
      const year = release.releaseDate
        ? new Date(release.releaseDate).getUTCFullYear().toString()
        : null;
      if (year && year !== prev) {
        headers.add(release.id);
        prev = year;
      }
    }
    return headers;
  }, [releases]);

  return (
    <div
      className='flex flex-col gap-0.5'
      data-testid='profile-mode-drawer-releases'
    >
      {releases.map(release => {
        if (!release.slug) return null;

        const year = release.releaseDate
          ? new Date(release.releaseDate).getUTCFullYear().toString()
          : null;
        const showHeader = yearHeaderSet.has(release.id);

        const collabs = release.artistNames
          .filter(name => name.toLowerCase() !== ownerNameLower)
          .join(', ');

        const metaParts = [formatReleaseType(release.releaseType), year].filter(
          Boolean
        );

        const ariaLabel = collabs
          ? `View ${release.title} by ${collabs}`
          : `View ${release.title}`;

        return (
          <div key={release.id}>
            {showHeader ? (
              <div className='px-4 pb-1 pt-4 text-2xs font-caption text-white/30'>
                {year}
              </div>
            ) : null}
            <a
              href={`/${artistHandle}/${release.slug}`}
              className='flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-150 ease-out hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-inset active:bg-white/[0.08]'
              aria-label={ariaLabel}
            >
              <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-md'>
                <ImageWithFallback
                  src={release.artworkUrl}
                  alt={release.title}
                  fill
                  sizes='40px'
                  className='object-cover'
                />
              </div>
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className={`truncate ${PROFILE_DRAWER_TITLE_CLASS}`}>
                  {release.title}
                </span>
                <span className={PROFILE_DRAWER_META_CLASS}>
                  {collabs ? `${collabs} \u00b7 ` : ''}
                  {metaParts.join(' \u00b7 ')}
                  {release.releaseType === 'music_video' ? (
                    <span className='ml-1.5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-3xs font-caption text-white/50'>
                      Video
                    </span>
                  ) : null}
                </span>
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
