'use client';

import type { Artist } from '@/types/db';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { SubscribeView } from './views/SubscribeView';

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
      <SubscribeView artist={artist} subscribeTwoStep={subscribeTwoStep} />
    </ProfileDrawerShell>
  );
}
