'use client';

import { Button } from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface ReleaseMatrixHeaderProps {
  totalReleases: number;
  totalOverrides: number;
  spotifyConnected: boolean;
  isSyncing: boolean;
  onSync: () => void;
}

export function ReleaseMatrixHeader({
  totalReleases,
  totalOverrides,
  spotifyConnected,
  isSyncing,
  onSync,
}: ReleaseMatrixHeaderProps) {
  return (
    <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
      <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
        <div>
          <p className='text-sm font-semibold uppercase tracking-[0.12em] text-secondary-token'>
            Discography
          </p>
          <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
            Releases
          </h1>
          <p className='mt-1 max-w-2xl text-sm leading-6 text-secondary-token'>
            Share one smart link per release and keep provider URLs pristine.
            Copy-ready variants for each DSP make sure fans land in the right
            app every time.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token'>
            {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
          </span>
          {totalOverrides > 0 && (
            <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'>
              <Icon name='PencilLine' className='h-3 w-3' aria-hidden='true' />
              {totalOverrides} {totalOverrides === 1 ? 'override' : 'overrides'}
            </span>
          )}
          {spotifyConnected && (
            <Button
              variant='secondary'
              size='sm'
              disabled={isSyncing}
              onClick={onSync}
              data-testid='sync-spotify-button'
              className='inline-flex items-center gap-2'
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
          )}
        </div>
      </div>
    </div>
  );
}
