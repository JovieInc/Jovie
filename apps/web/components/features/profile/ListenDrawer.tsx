'use client';

import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { ListenView } from './views/ListenView';

interface ListenDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artist: Artist;
  readonly dsps: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
}

export function ListenDrawer({
  open,
  onOpenChange,
  artist,
  dsps,
  enableDynamicEngagement = false,
}: ListenDrawerProps) {
  // Fire synthetic analytics event when drawer opens for funnel parity
  useEffect(() => {
    if (!open) return;

    track('listen_drawer_open', {
      handle: artist.handle,
    });

    return undefined;
  }, [open, artist.handle]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  // Preload deep-links module when drawer opens
  useEffect(() => {
    if (open) {
      import('@/lib/deep-links').catch(() => {});
    }
  }, [open]);

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title='Listen everywhere'
      subtitle={`Stream ${artist.name} on your favorite platform.`}
    >
      <ListenView
        artist={artist}
        dsps={dsps}
        enableDynamicEngagement={enableDynamicEngagement}
      />
    </ProfileDrawerShell>
  );
}
