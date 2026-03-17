'use client';

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';
import { cn } from '@/lib/utils';

interface HiddenInput {
  readonly name: string;
  readonly value: string | number | null | undefined;
}

export interface HeaderSearchActionProps {
  readonly searchValue: string;
  readonly onSearchValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly submitAriaLabel: string;
  readonly onApply?: () => void;
  readonly onClearAction?: () => void;
  readonly action?: string;
  readonly clearHref?: string;
  readonly hiddenInputs?: readonly HiddenInput[];
  readonly searchParamName?: string;
  readonly submitIcon?: ReactNode;
  readonly tooltipLabel?: string;
  readonly className?: string;
  readonly inputClassName?: string;
}

export function HeaderSearchAction({
  searchValue,
  onSearchValueChange,
  placeholder,
  ariaLabel,
  submitAriaLabel,
  onApply,
  onClearAction,
  action,
  clearHref,
  hiddenInputs = [],
  searchParamName = 'q',
  submitIcon = <Search className='h-4 w-4' />,
  tooltipLabel = 'Search',
  className,
  inputClassName,
}: Readonly<HeaderSearchActionProps>) {
  const [isOpen, setIsOpen] = useState(searchValue.length > 0);
  const router = useRouter();

  useEffect(() => {
    if (searchValue.length > 0) {
      setIsOpen(true);
    }
  }, [searchValue]);

  const close = () => {
    if (action && clearHref && searchValue.length > 0) {
      router.push(clearHref);
      return;
    }

    setIsOpen(false);
    onSearchValueChange('');
    onClearAction?.();
  };

  if (!isOpen) {
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
    <form
      action={action}
      method={action ? 'get' : undefined}
      className={cn('flex min-w-0 items-center gap-1.5', className)}
      onSubmit={event => {
        if (!action) {
          event.preventDefault();
          onApply?.();
        }
      }}
    >
      {action
        ? hiddenInputs.map(input =>
            input.value === undefined || input.value === null ? null : (
              <input
                key={input.name}
                type='hidden'
                name={input.name}
                value={String(input.value)}
              />
            )
          )
        : null}
      {action ? (
        <input type='hidden' name={searchParamName} value={searchValue} />
      ) : null}
      <AppSearchField
        value={searchValue}
        onChange={onSearchValueChange}
        onClear={onClearAction}
        onEscape={close}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        autoFocus
        showClearButton={false}
        className='w-[min(44vw,220px)] sm:w-[min(34vw,260px)] lg:w-[min(30vw,300px)]'
        inputClassName={cn('text-[13px]', inputClassName)}
      />
      {action && clearHref && searchValue.length > 0 ? (
        <AppIconButton
          asChild
          ariaLabel='Clear search'
          tooltipLabel='Clear search'
          className='border-transparent bg-transparent text-tertiary-token hover:border-transparent hover:bg-surface-1 hover:text-primary-token'
        >
          <Link href={clearHref}>
            <X className='h-4 w-4' />
          </Link>
        </AppIconButton>
      ) : (
        <AppIconButton
          type='button'
          ariaLabel={`Close ${tooltipLabel.toLowerCase()}`}
          tooltipLabel='Close search'
          className='border-transparent bg-transparent text-tertiary-token hover:border-transparent hover:bg-surface-1 hover:text-primary-token'
          onClick={close}
        >
          <X className='h-4 w-4' />
        </AppIconButton>
      )}
    </form>
  );
}
