'use client';

import { ChevronRight, Play } from 'lucide-react';
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
      {releases[0]?.slug ? (
        <a
          href={`/${artistHandle}/${releases[0].slug}`}
          className='group flex items-center gap-3 border-y border-white/[0.075] px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent'
          aria-label={`View ${releases[0].title}`}
        >
          <div className='relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[8px] bg-white/[0.04] shadow-[0_8px_20px_-10px_rgba(0,0,0,0.55)]'>
            <ImageWithFallback
              src={releases[0].artworkUrl}
              alt={releases[0].title}
              fill
              sizes='72px'
              className='object-cover grayscale contrast-[1.04]'
            />
          </div>
          <div className='min-w-0 flex-1'>
            <p className='text-[10px] font-[680] uppercase tracking-[0.18em] text-violet-300'>
              Latest Release
            </p>
            <p className='mt-1 truncate text-[17px] font-[680] leading-tight tracking-[-0.014em] text-white'>
              {releases[0].title}
            </p>
            <p className='mt-0.5 truncate text-[13px] text-white/64'>
              {formatReleaseType(releases[0].releaseType)}
              {releases[0].releaseDate
                ? ` · ${new Date(releases[0].releaseDate).getUTCFullYear()}`
                : ''}
            </p>
          </div>
          <span className='inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-[680] tracking-[-0.01em] text-black'>
            <Play className='h-3 w-3 fill-current' />
            Listen
          </span>
        </a>
      ) : null}

      {releases.length > 1 ? (
        <div className='flex items-baseline justify-between px-4 pb-2 pt-5'>
          <h3 className='text-[22px] font-[680] leading-none tracking-[-0.025em] text-white'>
            Top Songs
          </h3>
          <a
            href={`/${artistHandle}?mode=releases`}
            className='inline-flex items-center gap-1 text-[14px] font-medium text-white/64'
          >
            See All
            <ChevronRight className='h-3.5 w-3.5' />
          </a>
        </div>
      ) : null}

      <div
        className={cn(releases.length > 1 && 'border-y border-white/[0.075]')}
      >
        {releases.slice(1).map((release, index) => {
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
                  'group flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent hover:bg-white/[0.03]',
                  index > 0 && 'border-t border-white/[0.075]'
                )}
                aria-label={ariaLabel}
              >
                <div className='relative h-11 w-11 shrink-0 overflow-hidden rounded-[6px] bg-white/[0.04]'>
                  <ImageWithFallback
                    src={release.artworkUrl}
                    alt={release.title}
                    fill
                    sizes='44px'
                    className='object-cover grayscale contrast-[1.04]'
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
                  <span className='flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/[0.02] text-white/78 transition-[border-color,background-color] duration-200 group-hover:border-white/14 group-hover:bg-white/[0.05]'>
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
    </div>
  );
}
