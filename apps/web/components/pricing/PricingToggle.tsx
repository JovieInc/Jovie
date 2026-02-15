'use client';

import { useState } from 'react';

interface PricingToggleProps {
  readonly onChange: (isYearly: boolean) => void;
}

const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

export function PricingToggle({ onChange }: PricingToggleProps) {
  const [isYearly, setIsYearly] = useState(false);

  const handleToggle = (yearly: boolean) => {
    if (yearly !== isYearly) {
      setIsYearly(yearly);
      onChange(yearly);
    }
  };

  return (
    <div className='inline-flex items-center rounded-lg bg-surface-2 p-1'>
      <label
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 ${
          isYearly
            ? 'text-tertiary-token hover:text-secondary-token'
            : 'bg-surface-1 text-primary-token shadow-sm'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        <input
          type='radio'
          name='billing-interval'
          checked={!isYearly}
          onChange={() => handleToggle(false)}
          className='sr-only'
        />
        Monthly $5
      </label>
      <label
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 flex items-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 ${
          isYearly
            ? 'bg-surface-1 text-primary-token shadow-sm'
            : 'text-tertiary-token hover:text-secondary-token'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        <input
          type='radio'
          name='billing-interval'
          checked={isYearly}
          onChange={() => handleToggle(true)}
          className='sr-only'
        />
        Yearly $50{' '}
        <span className='text-xs text-success font-medium'>Save $10</span>
      </label>
    </div>
  );
}
