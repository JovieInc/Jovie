'use client';

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AmountSelector } from '@/components/atoms/AmountSelector';

interface TipSelectorProps {
  readonly amounts?: number[];
  readonly onContinue: (amount: number) => void;
  readonly isLoading?: boolean;
  readonly className?: string;
  /** Label for the payment method shown on the continue button (e.g. "Venmo", "Apple Pay") */
  readonly paymentLabel?: string;
}

export function TipSelector({
  amounts = [3, 5, 7],
  onContinue,
  isLoading = false,
  className = '',
  paymentLabel,
}: TipSelectorProps) {
  const defaultIdx = Math.floor(Math.max(0, amounts.length - 1) / 2);
  const [selectedIdx, setSelectedIdx] = useState<number>(defaultIdx);
  const statusRef = useRef<HTMLDivElement>(null);

  const selectedAmount = amounts[selectedIdx];

  const handleContinue = useCallback(() => {
    onContinue(selectedAmount);
  }, [onContinue, selectedAmount]);

  const handleAmountSelect = useCallback((idx: number) => {
    setSelectedIdx(idx);
  }, []);

  // Announce selection changes to screen readers
  useEffect(() => {
    if (statusRef.current) {
      statusRef.current.textContent = `$${selectedAmount} selected`;
    }
  }, [selectedAmount]);

  let continueLabel = `Continue with $${selectedAmount}`;
  if (isLoading) {
    continueLabel = 'Processing...';
  } else if (paymentLabel) {
    continueLabel = `Continue with ${paymentLabel}`;
  }

  return (
    <div className={`space-y-5 ${className}`} data-test='tip-selector'>
      <h3 id='tip-selector-heading' className='sr-only'>
        Select tip amount
      </h3>

      {/* Visually hidden live region for screen readers */}
      <div className='sr-only' aria-live='polite' ref={statusRef}></div>

      <p className='text-xs font-medium uppercase tracking-[0.15em] text-tertiary-token'>
        Choose amount
      </p>

      <fieldset
        className='grid grid-cols-3 gap-3 border-0 p-0 m-0'
        aria-label='Tip amount options'
      >
        {amounts.map((amount, idx) => (
          <AmountSelector
            key={amount}
            amount={amount}
            isSelected={idx === selectedIdx}
            onClick={handleAmountSelect}
            index={idx}
          />
        ))}
      </fieldset>

      <Button
        onClick={handleContinue}
        className='mt-4 w-full flex items-center justify-center gap-2.5'
        size='lg'
        disabled={isLoading}
        variant='primary'
        aria-label={
          paymentLabel
            ? `Continue with ${paymentLabel} for $${selectedAmount} tip`
            : `Continue with $${selectedAmount} tip`
        }
      >
        {paymentLabel && (
          <svg
            width='20'
            height='20'
            viewBox='0 0 24 24'
            fill='white'
            className='shrink-0'
            aria-hidden='true'
            role='img'
          >
            <title>Venmo</title>
            <path d='M19.04 2C19.7 3.19 20 4.41 20 5.97c0 4.87-4.16 11.19-7.54 15.64H5.2L2 3.28l6.29-.6 1.64 9.96c1.52-2.48 3.4-6.38 3.4-9.03 0-1.46-.25-2.45-.63-3.27L19.04 2z' />
          </svg>
        )}
        {continueLabel}
      </Button>
    </div>
  );
}
