'use client';

import {
  HostDrawnInput,
  PlainButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import { Check, Search } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POPULAR_CITIES } from '@/constants/cities';
import { cn } from '@/lib/utils';
import './LocationPicker.search.css';

/** Top cities shown before the full alphabetical list */
const FEATURED_CITIES = POPULAR_CITIES.slice(0, 10);

interface CityOptionProps {
  readonly label: string;
  readonly isSelected: boolean;
  readonly onSelect: (value: string) => void;
}

const CityOption = memo(function CityOption({
  label,
  isSelected,
  onSelect,
}: CityOptionProps) {
  const handleClick = useCallback(() => {
    onSelect(label);
  }, [onSelect, label]);

  return (
    <PlainButton
      type='button'
      onClick={handleClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-app transition-colors',
        isSelected
          ? 'bg-interactive-hover font-medium text-primary-token'
          : 'text-secondary-token hover:bg-interactive-hover hover:text-primary-token'
      )}
      data-testid='location-picker-option'
    >
      <span className='flex-1 text-left capitalize'>{label}</span>
      {isSelected ? (
        <Check className='h-3.5 w-3.5 shrink-0 text-primary-token' />
      ) : null}
    </PlainButton>
  );
});

interface LocationPickerProps {
  readonly value: string | null;
  readonly onSelect: (city: string) => void;
  readonly placeholder?: string;
  readonly trigger: React.ReactNode;
}

export function LocationPicker({
  value,
  onSelect,
  placeholder,
  trigger,
}: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredCities = useMemo(() => {
    if (!normalizedSearch) return null;
    return POPULAR_CITIES.filter(city => city.value.includes(normalizedSearch));
  }, [normalizedSearch]);

  const handleSelect = useCallback(
    (city: string) => {
      onSelect(city);
      setOpen(false);
      setSearch('');
    },
    [onSelect]
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  }, []);

  const showFreeText =
    normalizedSearch.length > 0 &&
    filteredCities !== null &&
    !filteredCities.some(c => c.value === normalizedSearch);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align='start' sideOffset={4} size='bare' className='w-64'>
        <div className='location-picker-search flex items-center gap-2 border-b border-subtle px-3 py-2'>
          <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
          <HostDrawnInput
            ref={searchRef}
            type='text'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder ?? 'Search cities...'}
            aria-label='Search Cities'
            className='min-w-0 flex-1'
          />
        </div>

        <div className='max-h-64 overflow-y-auto p-1.5'>
          {showFreeText ? (
            <PlainButton
              type='button'
              onClick={() => handleSelect(search.trim())}
              className='flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-app text-secondary-token hover:bg-interactive-hover hover:text-primary-token'
              data-testid='location-picker-free-text'
            >
              <span className='flex-1 text-left'>
                Use &ldquo;{search.trim()}&rdquo;
              </span>
            </PlainButton>
          ) : null}

          {filteredCities !== null &&
            filteredCities.length > 0 &&
            filteredCities.map(city => (
              <CityOption
                key={city.value}
                label={city.label}
                isSelected={value?.toLowerCase() === city.value}
                onSelect={handleSelect}
              />
            ))}
          {filteredCities !== null &&
          filteredCities.length === 0 &&
          showFreeText === false ? (
            <p className='px-2.5 py-3 text-center text-app text-tertiary-token'>
              No matching cities
            </p>
          ) : null}
          {filteredCities === null ? (
            <>
              <div className='px-2.5 pb-1 pt-1'>
                <span className='text-3xs font-medium tracking-wider text-quaternary-token'>
                  Popular
                </span>
              </div>
              {FEATURED_CITIES.map(city => (
                <CityOption
                  key={city.value}
                  label={city.label}
                  isSelected={value?.toLowerCase() === city.value}
                  onSelect={handleSelect}
                />
              ))}

              <div className='px-2.5 pb-1 pt-3'>
                <span className='text-3xs font-medium tracking-wider text-quaternary-token'>
                  All Cities
                </span>
              </div>
              {POPULAR_CITIES.map(city => (
                <CityOption
                  key={`all-${city.value}`}
                  label={city.label}
                  isSelected={value?.toLowerCase() === city.value}
                  onSelect={handleSelect}
                />
              ))}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
