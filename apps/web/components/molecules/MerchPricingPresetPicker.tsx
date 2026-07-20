'use client';

import type { MerchMarginPreset } from '@/lib/merch/pricing';
import { cn } from '@/lib/utils';

export interface MerchPricingPresetOption {
  readonly preset: MerchMarginPreset;
  readonly label: string;
  readonly salePrice: string;
  readonly profit: string;
}

export function MerchPricingPresetPicker({
  options,
  value,
  onChange,
  className,
}: {
  readonly options: readonly MerchPricingPresetOption[];
  readonly value: MerchMarginPreset;
  readonly onChange: (preset: MerchMarginPreset) => void;
  readonly className?: string;
}) {
  const groupName = `merch-pricing-preset-${options.map(option => option.preset).join('-')}`;

  return (
    <fieldset
      className={cn('flex flex-wrap gap-1 border-0 p-0', className)}
      data-testid='merch-pricing-preset-picker'
    >
      <legend className='sr-only'>Pricing preset</legend>
      {options.map(option => {
        const active = option.preset === value;
        return (
          <label
            key={option.preset}
            className={cn(
              'inline-flex h-7 cursor-pointer items-center rounded-md border px-2 text-3xs font-medium transition-[background-color,border-color,color] duration-subtle has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/55',
              active
                ? 'border-default bg-surface-1 text-primary-token'
                : 'border-subtle bg-surface-0 text-tertiary-token hover:border-default hover:text-secondary-token'
            )}
          >
            <input
              type='radio'
              name={groupName}
              value={option.preset}
              checked={active}
              onChange={() => onChange(option.preset)}
              className='sr-only'
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
