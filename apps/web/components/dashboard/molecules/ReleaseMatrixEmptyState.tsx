'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface ReleaseMatrixEmptyStateProps {
  spotifyConnected: boolean;
  isSyncing: boolean;
  onSync: () => void;
}

export function ReleaseMatrixEmptyState({
  spotifyConnected,
  isSyncing,
  onSync,
}: ReleaseMatrixEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-2'>
        <Icon
          name='Disc3'
          className='h-8 w-8 text-tertiary-token'
          aria-hidden='true'
        />
      </div>
      <h3 className='mt-4 text-lg font-semibold text-primary-token'>
        No releases yet
      </h3>
      {spotifyConnected ? (
        <>
          <p className='mt-1 max-w-sm text-sm text-secondary-token'>
            Sync your discography from Spotify to start generating smart links
            for your releases.
          </p>
          <Button
            variant='primary'
            size='sm'
            disabled={isSyncing}
            onClick={onSync}
            className='mt-4 inline-flex items-center gap-2'
            data-testid='sync-spotify-empty-state'
          >
            <Icon
              name={isSyncing ? 'Loader2' : 'RefreshCw'}
              className={cn(
                'h-4 w-4',
                isSyncing && 'animate-spin motion-reduce:animate-none'
              )}
              aria-hidden='true'
            />
            {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
          </Button>
        </>
      ) : (
        <>
          <p className='mt-1 max-w-sm text-sm text-secondary-token'>
            Connect your Spotify artist profile to import your releases and
            generate smart links.
          </p>
          <Link
            href='/app/dashboard/settings'
            className='mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1ed760]'
          >
            <Icon name='Music' className='h-4 w-4' aria-hidden='true' />
            Connect Spotify
          </Link>
        </>
      )}
    </div>
  );
}
