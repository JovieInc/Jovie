'use client';

import { Button } from '@jovie/ui';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';

interface ReleasesEmptyStateProps {
  readonly onConnectSpotify: () => void;
}

export function ReleasesEmptyState({
  onConnectSpotify,
}: ReleasesEmptyStateProps) {
  return (
    <DrawerSurfaceCard className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'>
      <h3 className='text-[13px] font-[510] text-(--linear-text-primary)'>
        Connect Spotify
      </h3>
      <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-(--linear-text-secondary)'>
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
    </DrawerSurfaceCard>
  );
}
