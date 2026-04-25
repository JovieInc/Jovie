'use client';

import { Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';
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
}: Readonly<HeaderSearchActionProps>) {
  const [isOpen, setIsOpen] = useState(alwaysOpen || searchValue.length > 0);

  useEffect(() => {
    if (searchValue.length > 0) {
      setIsOpen(true);
    }
  }, [searchValue]);

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
      <DashboardHeaderActionButton
        ariaLabel={submitAriaLabel}
        onClick={() => setIsOpen(true)}
        icon={submitIcon}
        iconOnly
        tooltipLabel={tooltipLabel}
        className={className}
      />
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
        inputClassName={cn('text-app', inputClassName)}
      />
      {alwaysOpen && searchValue.length === 0 ? null : (
        <AppIconButton
          type='button'
          ariaLabel={
            alwaysOpen ? 'Clear search' : `Close ${tooltipLabel.toLowerCase()}`
          }
          tooltipLabel={alwaysOpen ? 'Clear search' : 'Close search'}
          className='border-transparent bg-transparent text-tertiary-token hover:border-transparent hover:bg-surface-1 hover:text-primary-token'
          onClick={close}
        >
          <X className='h-4 w-4' />
        </AppIconButton>
      )}
    </div>
  );
}
