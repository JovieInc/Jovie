'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { TipSelector } from '@/components/molecules/TipSelector';
import { isAllowedVenmoUrl } from '@/components/profile/utils/venmo';
import { track } from '@/lib/analytics';

type VenmoTipSelectorProps = {
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: number[];
  readonly className?: string;
  readonly onContinue?: (url: string) => void;
};

export default function VenmoTipSelector({
  venmoLink,
  venmoUsername,
  amounts = [3, 5, 7],
  className,
  onContinue,
}: VenmoTipSelectorProps) {
  const handleAmountSelected = useCallback(
    (amount: number) => {
      if (!isAllowedVenmoUrl(venmoLink)) {
        track('tip_handoff_failed', {
          reason: 'invalid_venmo_url',
          venmoLink,
        });
        toast.error('Unable to open Venmo. The payment link is not valid.');
        return;
      }

      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      onContinue?.(url);
      const win = globalThis.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        track('tip_handoff_failed', {
          reason: 'popup_blocked',
          venmoLink,
          amount,
        });
        toast.error(
          'Venmo could not be opened. Please allow pop-ups and try again.'
        );
      }
    },
    [venmoLink, venmoUsername, onContinue]
  );

  return (
    <section className={className} aria-label='Venmo Tipping'>
      <TipSelector
        amounts={amounts}
        onContinue={handleAmountSelected}
        paymentLabel='Venmo'
      />
    </section>
  );
}
