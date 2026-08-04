'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import { memo, useCallback } from 'react';

export interface CountryOption {
  code: string;
  dialCode: string;
  label: string;
}

const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

// Public fan capture supports only US/CAN. Keep those two crisp vectors local
// instead of sending the entire flag-icons stylesheet and asset catalogue to
// every profile visitor. This also avoids platform-dependent emoji rendering.
function CountryFlag({ code }: { readonly code: string }) {
  if (code === 'CA') {
    return (
      <svg
        aria-hidden='true'
        className='h-4 w-5 shrink-0 overflow-hidden rounded-[2px]'
        viewBox='0 0 640 480'
      >
        <path fill='#fff' d='M150.1 0h339.7v480H150z' />
        <path
          fill='#d52b1e'
          d='M-19.7 0h169.8v480H-19.7zm509.5 0h169.8v480H489.9zM201 232l-13.3 4.4 61.4 54c4.7 13.7-1.6 17.8-5.6 25l66.6-8.4-1.6 67 13.9-.3-3.1-66.6 66.7 8c-4.1-8.7-7.8-13.3-4-27.2l61.3-51-10.7-4c-8.8-6.8 3.8-32.6 5.6-48.9 0 0-35.7 12.3-38 5.8l-9.2-17.5-32.6 35.8c-3.5.9-5-.5-5.9-3.5l15-74.8-23.8 13.4q-3.2 1.3-5.2-2.2l-23-46-23.6 47.8q-2.8 2.5-5 .7L264 130.8l13.7 74.1c-1.1 3-3.7 3.8-6.7 2.2l-31.2-35.3c-4 6.5-6.8 17.1-12.2 19.5s-23.5-4.5-35.6-7c4.2 14.8 17 39.6 9 47.7'
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden='true'
      className='h-4 w-5 shrink-0 overflow-hidden rounded-[2px]'
      viewBox='0 0 640 480'
    >
      <path fill='#bd3d44' d='M0 0h640v480H0z' />
      <path
        stroke='#fff'
        strokeWidth='37'
        d='M0 55.3h640M0 129h640M0 203h640M0 277h640M0 351h640M0 425h640'
      />
      <path fill='#192f5d' d='M0 0h364.8v258.5H0z' />
      <g fill='#fff'>
        {[42, 102, 162, 222, 282].flatMap(x =>
          [38, 91, 144, 197].map((y, row) => (
            <circle
              key={`${x}-${y}`}
              cx={x + (row % 2 === 0 ? 0 : 30)}
              cy={y}
              r='8'
            />
          ))
        )}
      </g>
    </svg>
  );
}

// Public fan-capture SMS is limited to US/CAN for consent and deliverability.
export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', dialCode: '+1', label: 'United States' },
  { code: 'CA', dialCode: '+1', label: 'Canada' },
];

interface CountryOptionButtonProps {
  readonly option: CountryOption;
  readonly isSelected: boolean;
  readonly onSelect: (option: CountryOption) => void;
}

const CountryOptionButton = memo(function CountryOptionButton({
  option,
  isSelected,
  onSelect,
}: CountryOptionButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(option);
  }, [onSelect, option]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`flex w-full items-center gap-3 rounded-(--radius-2xl) px-3 py-2 text-app font-semibold leading-5 tracking-tight transition-colors duration-normal ease-out ${
        isSelected
          ? 'border border-[color:var(--profile-pearl-border)] bg-(--profile-pearl-bg-active) text-primary-token'
          : 'text-primary-token hover:bg-(--profile-pearl-bg)'
      }`}
      style={FONT_SYNTHESIS_STYLE}
    >
      <CountryFlag code={option.code} />
      <span className='flex-1 text-left'>{option.label}</span>
      <span className='text-tertiary-token'>{option.dialCode}</span>
      {isSelected && <Check className='w-4 h-4 text-primary-token' />}
    </button>
  );
});

interface CountrySelectorProps {
  readonly country: CountryOption;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (country: CountryOption) => void;
}

export function CountrySelector({
  country,
  isOpen,
  onOpenChange,
  onSelect,
}: CountrySelectorProps) {
  const handleSelect = useCallback(
    (option: CountryOption) => {
      onSelect(option);
      onOpenChange(false);
    },
    [onSelect, onOpenChange]
  );

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='flex h-12 items-center gap-1.5 rounded-full px-3 text-mid font-semibold tracking-[-0.015em] text-primary-token transition-colors hover:text-primary-token focus-visible:outline-none'
          style={FONT_SYNTHESIS_STYLE}
          aria-label='Select Country Code'
        >
          <CountryFlag code={country.code} />
          <span>{country.dialCode}</span>
          <ChevronDown className='w-3.5 h-3.5 text-tertiary-token' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        sideOffset={6}
        className='w-64 rounded-(--radius-3xl) border border-[color:var(--profile-panel-border)] bg-(--profile-drawer-bg) p-2 shadow-(--profile-panel-shadow) backdrop-blur-2xl'
      >
        <div className='max-h-64 overflow-y-auto'>
          {COUNTRY_OPTIONS.map(option => (
            <CountryOptionButton
              key={option.code}
              option={option}
              isSelected={country.code === option.code}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
