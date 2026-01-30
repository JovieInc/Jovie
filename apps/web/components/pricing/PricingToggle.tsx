'use client';

import { useState } from 'react';

interface PricingToggleProps {
  onChange: (isYearly: boolean) => void;
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
    <div className='inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1'>
      <button
        type='button'
        onClick={() => {
          if (isYearly) handleToggle();
        }}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
          !isYearly
            ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        Monthly $5
      </button>
      <button
        type='button'
        onClick={() => {
          if (!isYearly) handleToggle();
        }}
        className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-150 flex items-center gap-2 ${
          isYearly
            ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
        }`}
        style={FONT_SYNTHESIS_STYLE}
      >
        Yearly $50{' '}
        <span className='text-xs text-emerald-600 dark:text-emerald-400 font-medium'>
          Save $10
        </span>
      </button>
    </div>
  );
}
