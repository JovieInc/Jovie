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

      {/* role="group" is appropriate for button groups; <fieldset> has styling constraints */}
      <div // NOSONAR S6819
        className='grid grid-cols-3 gap-3'
        role='group'
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
      </div>

      <Button
        onClick={handleContinue}
        className='w-full'
        size='lg'
        disabled={isLoading}
        variant='primary'
        aria-label={
          paymentLabel
            ? `Continue with ${paymentLabel}`
            : `Continue with $${selectedAmount} tip`
        }
      >
        {isLoading
          ? 'Processing...'
          : paymentLabel
            ? `Continue with ${paymentLabel}`
            : `Continue with $${selectedAmount}`}
      </Button>
    </div>
  );
}
