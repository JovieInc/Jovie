'use client';

import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';

interface ReleasesEmptyStateProps {
  readonly onConnectSpotify: () => void;
}

export function ReleasesEmptyState({
  onConnectSpotify,
}: ReleasesEmptyStateProps) {
  return (
    <DrawerSurfaceCard
      variant='card'
      className='flex min-h-[220px] flex-col items-center justify-center rounded-[10px] px-4 py-12 text-center'
    >
      <h3 className='text-[13px] font-[510] text-primary-token'>
        Connect Spotify
      </h3>
      <p className='mt-1 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
        Search your artist profile to import releases.
      </p>
      <DrawerButton tone='primary' onClick={onConnectSpotify} className='mt-4'>
        Connect Spotify
      </DrawerButton>
    </DrawerSurfaceCard>
  );
}
