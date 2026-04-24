'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, Loader2, Music } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { memo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import type { RecentRelease } from '@/lib/queries';
import { cn } from '@/lib/utils';

type IngestionStatus = 'idle' | 'pending' | 'processing' | 'failed';

interface MusicImportHeroProps {
  readonly ingestionStatus: IngestionStatus;
  readonly releases: RecentRelease[];
  readonly isLoading: boolean;
}

function ReleaseCard({ release }: { readonly release: RecentRelease }) {
  return (
    <div className='flex w-28 shrink-0 flex-col gap-1.5'>
      <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-surface-2'>
        {release.artworkUrl ? (
          <Image
            src={release.artworkUrl}
            alt={release.title}
            fill
            className='object-cover'
            sizes='112px'
            unoptimized
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center text-tertiary-token'>
            <Music className='h-6 w-6' />
          </div>
        )}
      </div>
      <p className='truncate text-xs font-medium text-primary-token'>
        {release.title}
      </p>
    </div>
  );
}

const LOADING_KEYS = ['a', 'b', 'c', 'd'] as const;

function LoadingCards() {
  return (
    <>
      {LOADING_KEYS.map(id => (
        <div key={id} className='flex w-28 shrink-0 flex-col gap-1.5'>
          <div className='aspect-square w-full animate-pulse rounded-lg bg-surface-2' />
          <div className='h-3 w-20 animate-pulse rounded bg-surface-2' />
        </div>
      ))}
    </>
  );
}

export const MusicImportHero = memo(function MusicImportHero({
  ingestionStatus,
  releases,
  isLoading,
}: MusicImportHeroProps) {
  const isImporting =
    ingestionStatus === 'processing' || ingestionStatus === 'pending';
  const isFailed = ingestionStatus === 'failed';
  const hasReleases = releases.length > 0;

  // Don't render when idle with no releases and not loading
  if (!isImporting && !isFailed && !hasReleases && !isLoading) {
    return null;
  }

  // Failed state
  if (isFailed && !hasReleases) {
    return (
      <div className='rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-4'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <AlertCircle className='h-4 w-4 shrink-0' />
          <p className='text-sm'>
            We had trouble importing your music. Try refreshing from the{' '}
            <Link
              href={APP_ROUTES.DASHBOARD_RELEASES}
              className='font-medium text-accent underline-offset-2 hover:underline'
            >
              releases page
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const headline = (() => {
    if (isImporting) return "We're importing your music";
    const plural = releases.length === 1 ? '' : 's';
    return `${releases.length} release${plural} ready`;
  })();

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        {isImporting && (
          <Loader2 className='h-3.5 w-3.5 animate-spin text-accent' />
        )}
        <p
          className={cn(
            'text-sm font-medium',
            isImporting ? 'text-accent' : 'text-primary-token'
          )}
        >
          {headline}
        </p>
      </div>

      {/* Release carousel */}
      <div className='flex gap-3 overflow-x-auto pb-1 scrollbar-hide'>
        {isLoading ? (
          <LoadingCards />
        ) : (
          releases.map(release => (
            <ReleaseCard key={release.id} release={release} />
          ))
        )}
      </div>

      {/* CTA */}
      {(hasReleases || isImporting) && (
        <Button
          variant='secondary'
          size='sm'
          asChild
          className='rounded-[10px] text-2xs font-caption tracking-[-0.01em]'
        >
          <Link href={APP_ROUTES.DASHBOARD_RELEASES}>
            {isImporting ? 'View All Releases' : 'Explore Your Releases'}
          </Link>
        </Button>
      )}
    </div>
  );
});
