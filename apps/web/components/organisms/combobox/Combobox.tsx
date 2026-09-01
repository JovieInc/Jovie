'use client';

import {
  ComboboxButton,
  ComboboxInput,
  Combobox as HeadlessCombobox,
} from '@headlessui/react';
import { Spinner as LoadingSpinner } from '@jovie/ui';
import { clsx } from 'clsx';
import { ChevronDown, Search } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ComboboxDropdown } from './ComboboxDropdown';
import type { ComboboxOption, ComboboxProps } from './types';
import { useComboboxKeyboard } from './useComboboxKeyboard';

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

    const { handleKeyDown } = useComboboxKeyboard({
      isOpen,
      setIsOpen,
      activeIndex,
      setActiveIndex,
      filteredOptions,
      handleSelect,
      inputRef,
    });

    const handleInputChange = useCallback(
      (newQuery: string) => {
        setQuery(newQuery);
        onInputChange(newQuery);
        setIsOpen(true);
      },
      [onInputChange]
    );

    const displayValue = useCallback((item: ComboboxOption | null) => {
      return item?.name || '';
    }, []);

    const handleSubmit = useCallback(() => {
      if (onSubmit && value) {
        onSubmit();
      }
    }, [onSubmit, value]);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        setIsOpen(open);
        if (open) {
          setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
        }
      },
      [filteredOptions]
    );

    const isValidSelection = value !== null;

    return (
      <div className={clsx('relative w-full', className)} ref={ref}>
        <label htmlFor={inputId} className='sr-only'>
          {label}
        </label>

        <div aria-live='polite' aria-atomic='true' className='sr-only'>
          {value ? `Selected: ${value.name}` : ''}
        </div>

        <HeadlessCombobox
          value={value}
          onChange={val => {
            if (val) handleSelect(val);
          }}
          disabled={disabled}
          nullable
        >
          {({ open }) => {
            if (open !== isOpen) {
              handleOpenChange(open);
            }

            return (
              <>
                <div
                  data-combobox-surface=''
                  className={clsx(
                    'relative flex w-full overflow-hidden',
                    'rounded-xl border border-subtle bg-surface-0',
                    'focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/25',
                    'flex-col sm:flex-row',
                    error &&
                      'border-error focus-within:border-error focus-within:ring-error/25',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className='relative flex-1'>
                    <ComboboxInput
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
                        'w-full border-0 bg-transparent outline-none ring-0 focus-visible:ring-0',
                        'px-4 py-3.5 text-sm/6 text-primary-token placeholder:text-tertiary-token',
                        'h-12 sm:h-11',
                        'rounded-xl sm:rounded-l-xl sm:rounded-r-none',
                        'focus-visible:outline-none',
                        disabled && 'cursor-not-allowed'
                      )}
                      placeholder={placeholder}
                      onChange={event => handleInputChange(event.target.value)}
                      onKeyDown={handleKeyDown}
                      displayValue={displayValue}
                      disabled={disabled}
                      autoComplete='off'
                    />

                    <ComboboxButton
                      className={clsx(
                        'absolute inset-y-0 right-0 flex items-center justify-center w-10',
                        'text-tertiary-token transition-colors duration-fast ease-interactive hover:text-primary-token',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/35',
                        disabled && 'cursor-not-allowed'
                      )}
                      disabled={disabled}
                      aria-label={open ? 'Close dropdown' : 'Open dropdown'}
                    >
                      {isLoading ? (
                        <LoadingSpinner
                          size='sm'
                          className='text-tertiary-token'
                        />
                      ) : (
                        <ChevronDown
                          className={clsx(
                            'h-4 w-4 transition-transform duration-fast ease-interactive',
                            open && 'rotate-180'
                          )}
                          aria-hidden='true'
                        />
                      )}
                    </ComboboxButton>
                  </div>

                  {showCta && (
                    <div
                      className='max-sm:hidden w-px bg-surface-2'
                      aria-hidden='true'
                    />
                  )}

                  {showCta && (
                    <button
                      type='button'
                      onClick={handleSubmit}
                      disabled={disabled || !isValidSelection}
                      className={clsx(
                        'border border-btn-primary bg-btn-primary text-btn-primary-foreground shadow-button-inset',
                        'h-12 sm:h-11 rounded-xl sm:rounded-l-none sm:rounded-r-xl',
                        'px-4 sm:px-6 flex items-center justify-center gap-2',
                        'text-sm font-medium transition-colors duration-fast ease-interactive',
                        'hover:border-btn-primary-hover hover:bg-btn-primary-hover',
                        'disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)] disabled:text-(--color-text-disabled-token)',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page'
                      )}
                      aria-label={`${ctaText} for ${value?.name || 'selected artist'}`}
                    >
                      <Search className='h-4 w-4' aria-hidden='true' />
                      {ctaText}
                    </button>
                  )}
                </div>

                {error && (
                  <p
                    id={errorId}
                    className='mt-2 text-sm text-destructive'
                    role='alert'
                  >
                    {error}
                  </p>
                )}

                <ComboboxDropdown
                  ref={optionsRef}
                  listboxId={listboxId}
                  isOpen={open}
                  isLoading={isLoading}
                  query={query}
                  filteredOptions={filteredOptions}
                />
              </>
            );
          }}
        </HeadlessCombobox>
      </div>
    );
  }
);

Combobox.displayName = 'Combobox';
