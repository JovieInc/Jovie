'use client';

import { IconButton, TooltipShortcut } from '@jovie/ui';
import { Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { cn } from '@/lib/utils';

export interface HeaderSearchActionProps {
  readonly searchValue: string;
  readonly onSearchValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly submitAriaLabel: string;
  readonly onClearAction?: () => void;
  readonly submitIcon?: ReactNode;
  readonly tooltipLabel?: string;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly alwaysOpen?: boolean;
  readonly openSignal?: number;
}

export function HeaderSearchAction({
  searchValue,
  onSearchValueChange,
  placeholder,
  ariaLabel,
  submitAriaLabel,
  onClearAction,
  submitIcon = <Search className='h-4 w-4' />,
  tooltipLabel = 'Search',
  className,
  inputClassName,
  alwaysOpen = false,
  openSignal,
}: Readonly<HeaderSearchActionProps>) {
  const [isOpen, setIsOpen] = useState(alwaysOpen || searchValue.length > 0);

  useEffect(() => {
    if (searchValue.length > 0) {
      setIsOpen(true);
    }
  }, [searchValue]);

  useEffect(() => {
    if (openSignal === undefined) return;
    setIsOpen(true);
  }, [openSignal]);

  const close = () => {
    if (alwaysOpen) {
      onSearchValueChange('');
      onClearAction?.();
      return;
    }

    setIsOpen(false);
    onSearchValueChange('');
    onClearAction?.();
  };

  if (!isOpen && !alwaysOpen) {
    return (
      <TooltipShortcut label={tooltipLabel} side='bottom'>
        <IconButton
          type='button'
          variant='control'
          size='md'
          ariaLabel={submitAriaLabel}
          onClick={() => setIsOpen(true)}
          className={className}
        >
          {submitIcon}
        </IconButton>
      </TooltipShortcut>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-0.5', className)}>
      <AppSearchField
        value={searchValue}
        onChange={onSearchValueChange}
        onClear={onClearAction}
        onEscape={close}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        autoFocus={!alwaysOpen}
        showClearButton={false}
        className='w-[min(42vw,208px)] sm:w-[min(30vw,240px)] lg:w-[min(26vw,276px)]'
        inputClassName={inputClassName}
      />
      {alwaysOpen && searchValue.length === 0 ? null : (
        <TooltipShortcut
          label={alwaysOpen ? 'Clear search' : 'Close search'}
          side='bottom'
        >
          <IconButton
            type='button'
            variant='control'
            size='sm'
            ariaLabel={
              alwaysOpen
                ? 'Clear search'
                : `Close ${tooltipLabel.toLowerCase()}`
            }
            onClick={close}
          >
            <X className='h-4 w-4' />
          </IconButton>
        </TooltipShortcut>
      )}
    </div>
  );
}
