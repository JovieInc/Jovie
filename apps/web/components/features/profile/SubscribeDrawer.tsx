'use client';

import { ArtistNotificationsCTA } from '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA';
import { TwoStepNotificationsCTA } from '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA';
import type { Artist } from '@/types/db';
import { ProfileDrawerShell } from './ProfileDrawerShell';

interface SubscribeDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artist: Artist;
  readonly subscribeTwoStep?: boolean;
}

export function SubscribeDrawer({
  open,
  onOpenChange,
  artist,
  subscribeTwoStep = false,
}: SubscribeDrawerProps) {
  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={onOpenChange}
      title='Turn on notifications'
      subtitle='New releases and shows.'
    >
      {subscribeTwoStep ? (
        <TwoStepNotificationsCTA artist={artist} />
      ) : (
        <ArtistNotificationsCTA artist={artist} variant='button' autoOpen />
      )}
    </ProfileDrawerShell>
  );
}
