'use client';

import { Play } from 'lucide-react';
import { useMemo } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { track } from '@/lib/analytics';
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

function getReleaseSortTime(release: PublicRelease): number {
  if (!release.releaseDate) {
    return 0;
  }

  const parsed = Date.parse(release.releaseDate);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ReleasesViewProps {
  readonly releases: readonly PublicRelease[];
  readonly artistId: string;
  readonly artistHandle: string;
  readonly artistName: string;
}

export function ReleasesView({
  releases,
  artistId,
  artistHandle,
  artistName,
}: ReleasesViewProps) {
  const ownerNameLower = artistName.toLowerCase();
  const visibleReleases = useMemo(
    () =>
      [...releases]
        .filter(release => Boolean(release.slug))
        .sort(
          (left, right) => getReleaseSortTime(right) - getReleaseSortTime(left)
        ),
    [releases]
  );

  const yearHeaderSet = useMemo(() => {
    const years = new Set(
      visibleReleases
        .map(release =>
          release.releaseDate
            ? new Date(release.releaseDate).getUTCFullYear().toString()
            : null
        )
        .filter(Boolean)
    );

    if (visibleReleases.length < YEAR_HEADER_THRESHOLD || years.size < 2) {
      return new Set<string>();
    }

    const headers = new Set<string>();
    let previousYear: string | null = null;

    for (const release of visibleReleases) {
      const year = release.releaseDate
        ? new Date(release.releaseDate).getUTCFullYear().toString()
        : null;
      if (year && year !== previousYear) {
        headers.add(release.id);
        previousYear = year;
      }
    }

    return headers;
  }, [visibleReleases]);

  const getCollaborators = (release: PublicRelease) =>
    release.artistNames.filter(name => name.toLowerCase() !== ownerNameLower);

  const getReleaseMeta = (release: PublicRelease): string => {
    const collaborators = getCollaborators(release);
    const year = release.releaseDate
      ? new Date(release.releaseDate).getUTCFullYear().toString()
      : null;

    return [
      collaborators.length > 0 ? collaborators.join(', ') : null,
      formatReleaseType(release.releaseType),
      year,
    ]
      .filter(Boolean)
      .join(' • ');
  };

  const getReleaseAriaLabel = (release: PublicRelease): string => {
    const collaborators = getCollaborators(release);
    return collaborators.length > 0
      ? `View ${release.title} by ${collaborators.join(', ')}`
      : `View ${release.title}`;
  };

  return (
    <div
      className='border-y border-white/[0.075]'
      data-testid='profile-mode-drawer-releases'
    >
      {visibleReleases.map((release, index) => {
        if (!release.slug) {
          return null;
        }

        const year = release.releaseDate
          ? new Date(release.releaseDate).getUTCFullYear().toString()
          : null;
        const showHeader = yearHeaderSet.has(release.id);
        const meta = getReleaseMeta(release);

        return (
          <div key={release.id}>
            {showHeader ? (
              <div
                className='font-caption px-4 pb-2 pt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/24'
                data-testid='release-year-header'
              >
                {year}
              </div>
            ) : null}

            <a
              href={`/${artistHandle}/${release.slug}`}
              onClick={() =>
                track('release_click', {
                  artist_id: artistId,
                  profile_id: artistId,
                  profile_slug: artistHandle,
                  handle: artistHandle,
                  current_route_tab: 'music',
                  release_id: release.id,
                  release_slug: release.slug,
                  release_title: release.title,
                  is_latest: index === 0,
                })
              }
              className='group flex min-h-[64px] items-center gap-3 border-t border-white/[0.075] px-4 py-2.5 first:border-t-0 transition-colors duration-subtle hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
              aria-label={getReleaseAriaLabel(release)}
            >
              <div className='relative h-11 w-11 shrink-0 overflow-hidden rounded-[7px] bg-white/[0.04]'>
                <ImageWithFallback
                  src={release.artworkUrl}
                  alt={release.title}
                  fill
                  sizes='44px'
                  className='object-cover grayscale contrast-[1.04]'
                  fallbackVariant='release'
                />
              </div>

              <div className='min-w-0 flex-1 space-y-px'>
                <div className='flex min-w-0 items-center gap-1.5'>
                  <span className='truncate text-[15px] font-medium leading-tight tracking-[-0.028em] text-white'>
                    {release.title}
                  </span>
                  {index === 0 ? (
                    <span className='inline-flex h-[16px] shrink-0 items-center rounded-full bg-white px-1.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-black'>
                      Latest
                    </span>
                  ) : null}
                  {release.releaseType === 'music_video' ? (
                    <span className='inline-flex h-[16px] shrink-0 items-center rounded-full border border-white/8 bg-white/[0.04] px-1.5 text-[8px] font-semibold uppercase tracking-[0.04em] text-white/64'>
                      Video
                    </span>
                  ) : null}
                </div>
                <p className='text-2xs truncate text-[11.5px] font-medium tracking-[-0.01em] text-white/42'>
                  {meta}
                </p>
              </div>

              <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity duration-subtle group-hover:opacity-90'>
                <Play className='ml-0.5 h-3 w-3 fill-current' />
              </span>
            </a>
          </div>
        );
      })}
    </div>
  );
}
