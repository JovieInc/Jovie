'use client';

import { useCallback, useEffect } from 'react';
import { track } from '@/lib/analytics';
import { ProfileDrawerShell } from './ProfileDrawerShell';
import { PayView } from './views/PayView';

interface PayDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly artistName: string;
  readonly artistHandle: string;
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: number[];
}

export function PayDrawer({
  open,
  onOpenChange,
  artistName,
  artistHandle,
  venmoLink,
  venmoUsername,
  amounts = [5, 10, 20],
}: PayDrawerProps) {
  useEffect(() => {
    if (!open) return;

    track('tip_drawer_open', {
      handle: artistHandle,
    });

    // Fire tip_page_view pixel event for retargeting
    // @ts-expect-error - joviePixel is set by JoviePixel component
    if (globalThis.joviePixel?.track) {
      // @ts-expect-error - joviePixel is set by JoviePixel component
      globalThis.joviePixel.track('tip_page_view');
    }

    return undefined;
  }, [open, artistHandle]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={`Support ${artistName}`}
      subtitle='Send support instantly with Venmo.'
    >
      <PayView
        artistHandle={artistHandle}
        venmoLink={venmoLink}
        venmoUsername={venmoUsername}
        amounts={amounts}
      />
    </ProfileDrawerShell>
  );
}
