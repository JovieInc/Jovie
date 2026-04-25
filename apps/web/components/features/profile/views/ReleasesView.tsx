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
                'group flex items-center gap-3.5 py-4 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent hover:bg-white/[0.025]',
                index > 0 && 'border-t border-white/[0.075]'
              )}
              aria-label={ariaLabel}
            >
              <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-white/[0.04] shadow-[0_12px_28px_rgba(0,0,0,0.26)]'>
                <ImageWithFallback
                  src={release.artworkUrl}
                  alt={release.title}
                  fill
                  sizes='56px'
                  className='object-cover'
                />
              </div>

              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex items-center gap-2'>
                  <span className='truncate text-[16px] font-medium tracking-[-0.03em] text-white'>
                    {release.title}
                  </span>
                  {index === 0 ? (
                    <span className='inline-flex h-5 items-center rounded-full border border-white/10 bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#15161a]'>
                      New
                    </span>
                  ) : null}
                  {release.releaseType === 'music_video' ? (
                    <span className='inline-flex h-5 items-center rounded-full border border-white/10 bg-white/[0.04] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/68'>
                      Video
                    </span>
                  ) : null}
                </div>
                <p className='text-2xs truncate text-[14px] font-normal tracking-[-0.02em] text-white/52'>
                  {meta}
                </p>
              </div>

              <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/82 transition-[border-color,background-color] duration-200 group-hover:border-white/18 group-hover:bg-white/[0.06]'>
                <Play className='ml-0.5 h-4 w-4 fill-current' />
              </span>
            </a>
          </div>
        );
      })}
    </div>
  );
}
