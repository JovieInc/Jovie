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
      <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        <div className='mb-5 flex items-center gap-3'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#008CFF]/10'>
            <svg
              className='h-4.5 w-4.5 text-[#008CFF]'
              viewBox='0 0 24 24'
              fill='currentColor'
              aria-hidden='true'
            >
              <path d='M19.27 3c.76 1.25 1.1 2.54 1.1 4.17 0 5.2-4.43 11.97-8.04 16.73H5.14L2.63 3.65l6.26-.59 1.42 11.34c1.32-2.15 2.95-5.54 2.95-7.86 0-1.54-.26-2.6-.67-3.46L19.27 3Z' />
            </svg>
          </div>
          <div>
            <h2 className='text-[15px] font-semibold tracking-tight text-primary-token'>
              Send a Tip
            </h2>
            <p className='text-xs text-secondary-token'>via Venmo</p>
          </div>
        </div>

        <TipSelector amounts={amounts} onContinue={handleAmountSelected} />

        <p className='mt-4 text-center text-xs text-tertiary-token'>
          You&apos;ll be redirected to Venmo to complete your tip.
        </p>
      </div>
    </section>
  );
}
