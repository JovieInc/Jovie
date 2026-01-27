'use client';

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AmountSelector } from '@/components/atoms/AmountSelector';

interface TipSelectorProps {
  amounts?: number[];
  onContinue: (amount: number) => void;
  isLoading?: boolean;
  className?: string;
}

export function TipSelector({
  amounts = [3, 5, 7],
  onContinue,
  isLoading = false,
  className = '',
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
    <div className={`space-y-4 ${className}`} data-test='tip-selector'>
      <h3 id='tip-selector-heading' className='sr-only'>
        Select tip amount
      </h3>

      {/* Visually hidden live region for screen readers */}
      <div className='sr-only' aria-live='polite' ref={statusRef}></div>

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

      <hr className='mt-3 pt-3 border-t border-black/5 dark:border-white/10' />

      <Button
        onClick={handleContinue}
        className='w-full bg-black! text-white! hover:bg-gray-800! dark:bg-white! dark:text-black! dark:hover:bg-gray-100!'
        size='lg'
        disabled={isLoading}
        variant='ghost'
        aria-label={`Continue with $${selectedAmount} tip`}
      >
        {isLoading ? 'Processing...' : 'Continue'}
      </Button>
    </div>
  );
}
