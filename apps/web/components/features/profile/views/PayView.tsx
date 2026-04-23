'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { PaySelector } from '@/components/molecules/PaySelector';
import { isAllowedVenmoUrl } from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';

export interface PayViewProps {
  readonly artistHandle: string;
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: readonly number[];
}

/**
 * Body of the `pay` mode: amount picker that hands off to Venmo.
 *
 * Pure view component — no title or shell. The enclosing wrapper
 * (`ProfileDrawerShell`, or a routed page in plan PR 3a) owns chrome.
 */
export function PayView({
  artistHandle,
  venmoLink,
  venmoUsername,
  amounts = [5, 10, 20],
}: PayViewProps) {
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
    <PaySelector
      amounts={[...amounts]}
      onContinue={handleAmountSelected}
      paymentLabel='Venmo'
    />
  );
}
