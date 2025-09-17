'use client';

import * as Headless from '@headlessui/react';
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/20/solid';
import { clsx } from 'clsx';
import Image from 'next/image';
import React, {
  forwardRef,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

interface ComboboxOption {
  id: string;
  name: string;
  imageUrl?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  onInputChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  maxDisplayedOptions?: number;
  isLoading?: boolean;
  error?: string | null;
  ctaText?: string;
  showCta?: boolean;
}

export const Combobox = forwardRef<HTMLDivElement, ComboboxProps>(
  (
    {
      options,
      value,
      onChange,
      onInputChange,
      onSubmit,
      placeholder = 'Search for an artist...',
      label = 'Search for an artist',
      className,
      disabled,
      maxDisplayedOptions = 8,
      isLoading = false,
      error = null,
      ctaText = 'Claim Profile',
      showCta = true,
    },
    ref
  ) => {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const inputId = useId();
    const listboxId = useId();
    const errorId = useId();
    const optionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);

    // Memoize filtered options for better performance
    const filteredOptions = useMemo(() => {
      if (query === '') {
        return options.slice(0, maxDisplayedOptions);
      }

      const lowerQuery = query.toLowerCase();
      return options
        .filter(option => option.name.toLowerCase().includes(lowerQuery))
        .slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions]);

    // Reset active index when filtered options change
    useEffect(() => {
      setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
    }, [filteredOptions]);

    // Scroll active option into view
    useEffect(() => {
      if (isOpen && activeIndex >= 0 && optionsRef.current) {
        const activeOption = optionsRef.current.querySelector(
          `[data-index="${activeIndex}"]`
        );
        if (activeOption) {
          activeOption.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [activeIndex, isOpen]);

    // Forward declaration of handleSelect for TypeScript
    const handleSelect: (option: ComboboxOption | null) => void = useCallback(
      (option: ComboboxOption | null) => {
        if (option) {
          onChange(option);
        }
        setQuery('');
        setIsOpen(false);
      },
      [onChange]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
          }
          return;
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setActiveIndex(prev =>
              prev < filteredOptions.length - 1 ? prev + 1 : 0
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setActiveIndex(prev =>
              prev > 0 ? prev - 1 : filteredOptions.length - 1
            );
            break;
          case 'Home':
            e.preventDefault();
            setActiveIndex(0);
            break;
          case 'End':
            e.preventDefault();
            setActiveIndex(filteredOptions.length - 1);
            break;
          case 'Enter':
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
              handleSelect(filteredOptions[activeIndex]);
              setIsOpen(false);
              inputRef.current?.focus();
            }
            break;
          case 'Escape':
            e.preventDefault();
            setIsOpen(false);
            inputRef.current?.focus();
            break;
          case 'Tab':
            setIsOpen(false);
            break;
        }
      },
      [filteredOptions, isOpen, activeIndex, handleSelect]
    );

    // Memoize the input change handler
    const handleInputChange = useCallback(
      (newQuery: string) => {
        setQuery(newQuery);
        onInputChange(newQuery);
        setIsOpen(true);
      },
      [onInputChange]
    );

    // handleSelect is already defined above

    // Memoize the display value function
    const displayValue = useCallback((item: ComboboxOption | null) => {
      return item?.name || '';
    }, []);

    const handleSubmit = useCallback(() => {
      if (onSubmit && value) {
        onSubmit();
      }
    }, [onSubmit, value]);

    // Handle open state changes
    const handleOpenChange = useCallback(
      (open: boolean) => {
        setIsOpen(open);
        if (open) {
          // Reset active index when opening
          setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
        }
      },
      [filteredOptions]
    );

    const hasResults = filteredOptions.length > 0;
    const showNoResults = query.length > 0 && !hasResults && !isLoading;
    const isValidSelection = value !== null;

    return (
      <div className={clsx('relative w-full', className)} ref={ref}>
        {/* Hidden label for screen readers */}
        <label htmlFor={inputId} className='sr-only'>
          {label}
        </label>

        {/* Status announcer for screen readers */}
        <div aria-live='polite' aria-atomic='true' className='sr-only'>
          {value ? `Selected: ${value.name}` : ''}
        </div>

        <Headless.Combobox
          value={value}
          onChange={val => {
            if (val) handleSelect(val);
          }}
          disabled={disabled}
          nullable
        >
          {({ open }) => {
            // Sync our internal open state with Headless UI's open state
            if (open !== isOpen) {
              handleOpenChange(open);
            }

            return (
              <>
                {/* Single container with unified styling */}
                <div
                  className={clsx(
                    // Base container styles
                    'relative flex w-full overflow-hidden',
                    // Single border/ring system
                    'rounded-xl bg-white/5 backdrop-blur-xl shadow-lg ring-1 ring-white/10',
                    // Focus-within state for container
                    'focus-within:ring-2 focus-within:ring-white/20',
                    // Mobile stacking
                    'flex-col sm:flex-row',
                    // Error state
                    error && 'ring-red-500/50 focus-within:ring-red-500/50',
                    // Disabled state
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {/* Input section */}
                  <div className='relative flex-1'>
                    <Headless.Combobox.Input
                      ref={inputRef}
                      id={inputId}
                      aria-controls={listboxId}
                      aria-expanded={open}
                      aria-describedby={error ? errorId : undefined}
                      aria-activedescendant={
                        open &&
                        activeIndex >= 0 &&
                        activeIndex < filteredOptions.length
                          ? `option-${filteredOptions[activeIndex].id}`
                          : undefined
                      }
                      className={clsx(
                        // Remove native border and focus styles
                        'w-full border-0 bg-transparent outline-none ring-0 focus-visible:ring-0',
                        // Typography and spacing
                        'px-4 py-3.5 text-sm/6 text-white placeholder-white/70',
                        // Height matching (44px minimum for mobile)
                        'h-12 sm:h-11',
                        // Rounded corners (left only on desktop)
                        'rounded-xl sm:rounded-l-xl sm:rounded-r-none',
                        // Focus-visible for accessibility
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50',
                        // Disabled state
                        disabled && 'cursor-not-allowed'
                      )}
                      placeholder={placeholder}
                      onChange={event => handleInputChange(event.target.value)}
                      onKeyDown={handleKeyDown}
                      displayValue={displayValue}
                      disabled={disabled}
                      autoComplete='off'
                    />

                    {/* Dropdown button */}
                    <Headless.Combobox.Button
                      className={clsx(
                        'absolute inset-y-0 right-0 flex items-center justify-center w-10',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50',
                        disabled && 'cursor-not-allowed'
                      )}
                      disabled={disabled}
                      aria-label={open ? 'Close dropdown' : 'Open dropdown'}
                    >
                      {isLoading ? (
                        <LoadingSpinner size='sm' className='text-white/50' />
                      ) : (
                        <ChevronDownIcon
                          className={clsx(
                            'h-4 w-4 text-white/50 transition-transform',
                            open && 'rotate-180'
                          )}
                          aria-hidden='true'
                        />
                      )}
                    </Headless.Combobox.Button>
                  </div>

                  {/* Separator line */}
                  {showCta && (
                    <div
                      className='hidden sm:block w-px bg-white/10'
                      aria-hidden='true'
                    />
                  )}

                  {/* CTA Button */}
                  {showCta && (
                    <button
                      type='button'
                      onClick={handleSubmit}
                      disabled={disabled || !isValidSelection}
                      className={clsx(
                        // Remove default button styles and match container
                        'border-0 shadow-none ring-0',
                        // Height and radius matching
                        'h-12 sm:h-11 rounded-xl sm:rounded-l-none sm:rounded-r-xl',
                        // Spacing
                        'px-4 sm:px-6 flex items-center justify-center',
                        // Typography
                        'text-sm font-medium',
                        // Colors
                        'bg-white text-gray-900 hover:bg-white/90 transition-colors',
                        // Disabled state
                        'disabled:bg-white/50 disabled:text-gray-500 disabled:cursor-not-allowed',
                        // Focus state
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
                      )}
                      aria-label={`${ctaText} for ${value?.name || 'selected artist'}`}
                    >
                      <MagnifyingGlassIcon
                        className='h-4 w-4 mr-2'
                        aria-hidden='true'
                      />
                      {ctaText}
                    </button>
                  )}
                </div>

                {/* Error message */}
                {error && (
                  <p
                    id={errorId}
                    className='mt-2 text-sm text-red-400'
                    role='alert'
                  >
                    {error}
                  </p>
                )}

                {/* Dropdown options */}
                <Headless.Combobox.Options
                  ref={optionsRef}
                  id={listboxId}
                  className={clsx(
                    'absolute z-50 mt-2 max-h-60 w-full overflow-auto',
                    'rounded-xl bg-white/95 backdrop-blur-xl shadow-xl ring-1 ring-white/20',
                    'focus-visible:outline-none'
                  )}
                  static={open}
                >
                  {isLoading && query.length > 0 ? (
                    <div
                      className='px-4 py-3 text-sm text-gray-500'
                      role='status'
                    >
                      <div className='flex items-center space-x-2'>
                        <LoadingSpinner size='sm' className='text-gray-500' />
                        <span>Searching artists...</span>
                      </div>
                    </div>
                  ) : showNoResults ? (
                    <div
                      className='px-4 py-4 text-sm text-gray-500'
                      role='status'
                    >
                      <p className='mb-2'>
                        No artists found for &quot;{query}&quot;
                      </p>
                      <p className='text-xs text-gray-400'>
                        Can&apos;t find your artist?{' '}
                        <a
                          href='https://artists.spotify.com'
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-indigo-600 hover:text-indigo-500 underline'
                        >
                          Verify your Spotify artist profile
                        </a>
                      </p>
                    </div>
                  ) : (
                    filteredOptions.map((option, index) => (
                      <Headless.Combobox.Option
                        key={option.id}
                        className={({ active }) =>
                          clsx(
                            'relative cursor-pointer select-none px-4 py-3 transition-colors',
                            'focus-visible:outline-none',
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-900 hover:bg-gray-50'
                          )
                        }
                        value={option}
                        data-index={index}
                        id={`option-${option.id}`}
                      >
                        {({ active, selected }) => (
                          <div
                            className='flex items-center space-x-3'
                            role='option'
                            aria-selected={selected}
                          >
                            {option.imageUrl ? (
                              <Image
                                src={option.imageUrl}
                                alt=''
                                width={32}
                                height={32}
                                className='h-8 w-8 rounded-full object-cover flex-shrink-0'
                                aria-hidden='true'
                              />
                            ) : (
                              <div
                                className='h-8 w-8 rounded-full bg-gray-200 flex-shrink-0'
                                aria-hidden='true'
                              />
                            )}
                            <span
                              className={clsx(
                                'truncate text-sm',
                                active || selected
                                  ? 'font-semibold'
                                  : 'font-normal'
                              )}
                            >
                              {option.name}
                            </span>
                            {(active || selected) && (
                              <span
                                className={clsx(
                                  'absolute inset-y-0 right-0 flex items-center pr-4',
                                  active ? 'text-white' : 'text-indigo-600'
                                )}
                                aria-hidden='true'
                              >
                                <svg
                                  className='h-4 w-4'
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  aria-hidden='true'
                                >
                                  <path
                                    fillRule='evenodd'
                                    d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                    clipRule='evenodd'
                                  />
                                </svg>
                              </span>
                            )}
                          </div>
                        )}
                      </Headless.Combobox.Option>
                    ))
                  )}
                </Headless.Combobox.Options>
              </>
            );
          }}
        </Headless.Combobox>
      </div>
    );
  }
);

Combobox.displayName = 'Combobox';
