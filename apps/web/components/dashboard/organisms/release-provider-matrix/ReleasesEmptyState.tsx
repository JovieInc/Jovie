'use client';

import { Button } from '@jovie/ui';

interface ReleasesEmptyStateProps {
  readonly onConnectSpotify: () => void;
}

export function ReleasesEmptyState({
  onConnectSpotify,
}: ReleasesEmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center px-4 py-16 text-center'>
      <h3 className='text-sm font-medium text-primary-token'>
        Connect Spotify
      </h3>
      <p className='mt-1 max-w-sm text-sm text-secondary-token'>
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
