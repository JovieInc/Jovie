'use client';

import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { PaySelector } from '@/components/molecules/PaySelector';
import { isAllowedVenmoUrl } from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';
import { ProfileDrawerShell } from './ProfileDrawerShell';

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

  const handleAmountSelected = useCallback(
    (amount: number) => {
      if (!isAllowedVenmoUrl(venmoLink)) {
        track('tip_handoff_failed', {
          reason: 'invalid_venmo_url',
          handle: artistHandle,
          venmoLink,
        });
        toast.error('Unable to open Venmo. The payment link is not valid.');
        return;
      }

      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      // Fire tip_intent pixel event for retargeting
      // @ts-expect-error - joviePixel is set by JoviePixel component
      if (globalThis.joviePixel?.track) {
        // @ts-expect-error - joviePixel is set by JoviePixel component
        globalThis.joviePixel.track('tip_intent', {
          tipAmount: amount,
          tipMethod: 'venmo',
        });
      }

      const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        track('tip_handoff_failed', {
          reason: 'popup_blocked',
          handle: artistHandle,
          amount,
        });
        toast.error(
          'Venmo could not be opened. Please allow pop-ups and try again.'
        );
      }
    },
    [venmoLink, venmoUsername, artistHandle]
  );

  return (
    <ProfileDrawerShell
      open={open}
      onOpenChange={handleOpenChange}
      title={`Support ${artistName}`}
      subtitle='Send support instantly with Venmo.'
    >
      <PaySelector
        amounts={amounts}
        onContinue={handleAmountSelected}
        paymentLabel='Venmo'
      />
    </ProfileDrawerShell>
  );
}
