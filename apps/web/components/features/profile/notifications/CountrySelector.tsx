'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import 'flag-icons/css/flag-icons.min.css';

export interface CountryOption {
  code: string;
  dialCode: string;
  label: string;
}

const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

// SVG flag (flag-icons) keyed by ISO 3166-1 alpha-2 code. Replaces flag emoji
// — no emoji in UI (see .claude/rules/ui.md). Sized by font-size; the flag
// background image is clipped to the rounded corners.
function CountryFlag({ code }: { readonly code: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'fi rounded-sm text-base leading-none',
        `fi-${code.toLowerCase()}`
      )}
    />
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
