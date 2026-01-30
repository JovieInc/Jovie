'use client';

import { useCallback } from 'react';
import { TipSelector } from '@/components/molecules/TipSelector';

type VenmoTipSelectorProps = {
  venmoLink: string;
  venmoUsername?: string | null;
  amounts?: number[];
  className?: string;
  onContinue?: (url: string) => void;
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
      const sep = venmoLink.includes('?') ? '&' : '?';
      const url = `${venmoLink}${sep}utm_amount=${amount}&utm_username=${encodeURIComponent(
        venmoUsername ?? ''
      )}`;

      onContinue?.(url);
      globalThis.open(url, '_blank', 'noopener,noreferrer');
    },
    [venmoLink, venmoUsername, onContinue]
  );

  return (
    <section className={className} aria-label='Venmo Tipping'>
      <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-6 shadow-xl'>
        <h2 className='text-xl font-semibold mb-4 text-primary-token'>
          Send a Tip via Venmo
        </h2>
        <TipSelector amounts={amounts} onContinue={handleAmountSelected} />
        <p className='mt-4 text-sm text-secondary-token'>
          You&apos;ll be redirected to Venmo to complete your tip.
        </p>
      </div>
    </section>
  );
}
