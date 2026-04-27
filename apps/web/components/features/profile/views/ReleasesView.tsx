'use client';

import { Play } from 'lucide-react';
import { useMemo } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';
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
    let previousYear: string | null = null;

    for (const release of releases) {
      const year = release.releaseDate
        ? new Date(release.releaseDate).getUTCFullYear().toString()
        : null;
      if (year && year !== previousYear) {
        headers.add(release.id);
        previousYear = year;
      }
    }

    return headers;
  }, [releases]);

  return (
    <div className='flex flex-col' data-testid='profile-mode-drawer-releases'>
      {releases.map((release, index) => {
        if (!release.slug) {
          return null;
        }

        const year = release.releaseDate
          ? new Date(release.releaseDate).getUTCFullYear().toString()
          : null;
        const showHeader = yearHeaderSet.has(release.id);
        const collaborators = release.artistNames.filter(
          name => name.toLowerCase() !== ownerNameLower
        );
        const meta = [
          collaborators.length > 0 ? collaborators.join(', ') : null,
          formatReleaseType(release.releaseType),
          year,
        ]
          .filter(Boolean)
          .join(' • ');
        const ariaLabel =
          collaborators.length > 0
            ? `View ${release.title} by ${collaborators.join(', ')}`
            : `View ${release.title}`;

        return (
          <div key={release.id}>
            {showHeader ? (
              <div className='font-caption px-1 pb-2 pt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/24'>
                {year}
              </div>
            ) : null}

            <a
              href={`/${artistHandle}/${release.slug}`}
              className={cn(
                'group flex items-center gap-2.5 py-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent hover:bg-white/[0.02]',
                index > 0 && 'border-t border-white/[0.075]'
              )}
              aria-label={ariaLabel}
            >
              <div className='relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-[11px] bg-white/[0.04] shadow-[0_10px_22px_rgba(0,0,0,0.22)]'>
                <ImageWithFallback
                  src={release.artworkUrl}
                  alt={release.title}
                  fill
                  sizes='50px'
                  className='object-cover'
                />
              </div>

              <div className='min-w-0 flex-1 space-y-px'>
                <div className='flex items-center gap-1.25'>
                  <span className='truncate text-[15px] font-medium leading-tight tracking-[-0.028em] text-white'>
                    {release.title}
                  </span>
                  {index === 0 ? (
                    <span className='inline-flex h-[15px] items-center rounded-full border border-white/8 bg-white px-1.25 text-[8px] font-semibold uppercase tracking-[0.04em] text-[#15161a]'>
                      New
                    </span>
                  ) : null}
                  {release.releaseType === 'music_video' ? (
                    <span className='inline-flex h-[15px] items-center rounded-full border border-white/8 bg-white/[0.04] px-1.25 text-[8px] font-semibold uppercase tracking-[0.04em] text-white/64'>
                      Video
                    </span>
                  ) : null}
                </div>
                <p className='text-2xs truncate text-[11.5px] font-medium tracking-[-0.01em] text-white/38'>
                  {meta}
                </p>
              </div>

              <div className='ml-1 flex shrink-0 items-center gap-3'>
                <span className='flex h-[34px] w-[34px] items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white/78 transition-[border-color,background-color] duration-200 group-hover:border-white/14 group-hover:bg-white/[0.05]'>
                  <Play className='ml-0.5 h-3 w-3 fill-current' />
                </span>
                <span
                  aria-hidden='true'
                  className='flex items-center gap-[3px] text-white/24 transition-colors duration-200 group-hover:text-white/36'
                >
                  <span className='h-[3px] w-[3px] rounded-full bg-current' />
                  <span className='h-[3px] w-[3px] rounded-full bg-current' />
                  <span className='h-[3px] w-[3px] rounded-full bg-current' />
                </span>
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
