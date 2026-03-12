'use client';

import { Button } from '@jovie/ui';

interface ReleasesEmptyStateProps {
  readonly onConnectSpotify: () => void;
}

export function ReleasesEmptyState({
  onConnectSpotify,
}: ReleasesEmptyStateProps) {
  return (
    <div className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-4 py-12 text-center'>
      <h3 className='text-[13px] font-[510] text-primary-token'>
        Connect Spotify
      </h3>
      <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
        Search your artist profile to import releases.
      </p>
      <Button
        variant='primary'
        size='sm'
        onClick={onConnectSpotify}
        className='mt-4'
      >
        Connect Spotify
      </Button>
    </div>
  );
}
