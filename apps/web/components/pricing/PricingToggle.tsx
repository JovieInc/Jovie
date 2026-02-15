'use client';

import { useState } from 'react';

interface PricingToggleProps {
  readonly onChange: (isYearly: boolean) => void;
}

const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

export function PricingToggle({ onChange }: PricingToggleProps) {
  const [isYearly, setIsYearly] = useState(false);

  const handleToggle = () => {
    const newValue = !isYearly;
    setIsYearly(newValue);
    onChange(newValue);
  };

  return (
    <div className='inline-flex items-center rounded-lg bg-surface-2 p-1' role='radiogroup' aria-label='Billing interval'>
      <button
        type='button'
        role='radio'
        aria-checked={!isYearly}
        aria-label='Monthly billing at $5 per month'
        onClick={() => {
          if (isYearly) handleToggle();
        }}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 focus-ring-themed ${
          isYearly
            ? 'text-tertiary-token hover:text-secondary-token'
            : 'bg-surface-1 text-primary-token shadow-sm'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        Monthly $5
      </button>
      <button
        type='button'
        role='radio'
        aria-checked={isYearly}
        aria-label='Yearly billing at $50 per year, save $10'
        onClick={() => {
          if (!isYearly) handleToggle();
        }}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 flex items-center gap-2 focus-ring-themed ${
          isYearly
            ? 'bg-surface-1 text-primary-token shadow-sm'
            : 'text-tertiary-token hover:text-secondary-token'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        Yearly $50{' '}
        <span className='text-xs text-success font-medium'>Save $10</span>
      </button>
    </div>
  );
}
