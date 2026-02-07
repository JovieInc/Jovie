'use client';

import { useCallback } from 'react';
import { TipSelector } from '@/components/molecules/TipSelector';

const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

/** Validate that a URL points to venmo.com before opening it. */
function isAllowedVenmoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && ALLOWED_VENMO_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

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
      if (!isAllowedVenmoUrl(venmoLink)) return;

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
      <div className='bg-surface-0 backdrop-blur-sm border border-subtle rounded-xl p-5 shadow-sm'>
        <h2 className='text-lg font-semibold mb-3 text-primary-token'>
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
