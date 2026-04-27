'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { PaySelector } from '@/components/molecules/PaySelector';
import { isAllowedVenmoUrl } from '@/features/profile/utils/venmo';
import { track } from '@/lib/analytics';

type VenmoPaySelectorProps = {
  readonly venmoLink: string;
  readonly venmoUsername?: string | null;
  readonly amounts?: number[];
  readonly className?: string;
  readonly onContinue?: (url: string) => void;
};

export default function VenmoPaySelector({
  venmoLink,
  venmoUsername,
  amounts = [5, 10, 20],
  className,
  onContinue,
}: VenmoPaySelectorProps) {
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

      // Fire venmo_link_click pixel event for analytics
      // @ts-expect-error - joviePixel is set by JoviePixel component
      if (globalThis.joviePixel?.track) {
        // @ts-expect-error - joviePixel is set by JoviePixel component
        globalThis.joviePixel.track('venmo_link_click', {
          tipAmount: amount,
          tipMethod: 'venmo',
        });
      }

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
    <section className={className} aria-label='Venmo Payment'>
      <PaySelector
        amounts={amounts}
        onContinue={handleAmountSelected}
        presentation='drawer'
        primaryLabel='Send payment'
        paymentLabel='Venmo'
        showOtherPaymentOptions
        otherPaymentOptionsLabel='Other payment options'
      />
    </section>
  );
}
