'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import type { CountryOption } from '@/lib/notifications/countries';
import { COUNTRY_OPTIONS } from '@/lib/notifications/countries';

export interface CountrySelectorProps {
  country: CountryOption;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (country: CountryOption) => void;
}

export function CountrySelector({
  country,
  isOpen,
  onOpenChange,
  onSelect,
}: CountrySelectorProps) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='h-12 pl-4 pr-3 flex items-center gap-1.5 bg-transparent text-[15px] text-foreground hover:bg-surface-2 transition-colors focus:outline-none'
          style={{ fontSynthesisWeight: 'none' }}
          aria-label='Select country code'
        >
          <span>{country.flag}</span>
          <span>{country.dialCode}</span>
          <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        sideOffset={4}
        className='w-64 p-1 rounded-lg border border-subtle bg-surface-0 shadow-lg'
      >
        <div className='max-h-64 overflow-y-auto py-1'>
          {COUNTRY_OPTIONS.map(option => (
            <button
              key={option.code}
              type='button'
              onClick={() => {
                onSelect(option);
                onOpenChange(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                country.code === option.code
                  ? 'bg-surface-2 text-foreground'
                  : 'text-foreground hover:bg-surface-1'
              }`}
              style={{ fontSynthesisWeight: 'none' }}
            >
              <span className='text-base'>{option.flag}</span>
              <span className='flex-1 text-left'>{option.label}</span>
              <span className='text-muted-foreground'>{option.dialCode}</span>
              {country.code === option.code && (
                <Check className='w-4 h-4 text-foreground' />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
