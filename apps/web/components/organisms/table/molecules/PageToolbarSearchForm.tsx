'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { cn } from '@/lib/utils';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
} from './PageToolbar';

interface HiddenInput {
  readonly name: string;
  readonly value: string | number | null | undefined;
}

export interface PageToolbarSearchFormProps {
  readonly action?: string;
  readonly searchValue: string;
  readonly onSearchValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly submitAriaLabel: string;
  readonly clearHref?: string;
  readonly clearAriaLabel?: string;
  readonly onClearAction?: () => void;
  readonly onApply?: () => void;
  readonly applyLabel?: string;
  readonly hiddenInputs?: readonly HiddenInput[];
  readonly searchParamName?: string;
  readonly className?: string;
  readonly fieldClassName?: string;
  readonly submitIcon: ReactNode;
  readonly clearIcon: ReactNode;
  readonly compact?: boolean;
  readonly tooltipLabel?: string;
}

export function PageToolbarSearchForm({
  action,
  searchValue,
  onSearchValueChange,
  placeholder,
  ariaLabel,
  submitAriaLabel,
  clearHref,
  clearAriaLabel = 'Clear search',
  onClearAction,
  onApply,
  applyLabel = 'Apply',
  hiddenInputs = [],
  searchParamName = 'q',
  className,
  fieldClassName,
  submitIcon,
  clearIcon,
  compact = false,
  tooltipLabel,
}: Readonly<PageToolbarSearchFormProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const isRouteSearch = Boolean(action);

  if (compact) {
    const triggerLabel = tooltipLabel ?? 'Search';
    const showClearAction = isRouteSearch
      ? Boolean(clearHref && searchValue)
      : searchValue.length > 0;

    const handleLocalClear = () => {
      onSearchValueChange('');
      onClearAction?.();
    };

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label={submitAriaLabel}
            aria-pressed={isOpen}
            className={cn(
              PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
              PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
              (isOpen || searchValue.length > 0) &&
                'border-transparent bg-(--linear-bg-surface-1) text-(--linear-text-primary)'
            )}
          >
            {submitIcon}
            <span className='sr-only'>{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align='end' className='w-[320px] p-0'>
          <div className='flex items-center justify-between border-b border-(--linear-border-subtle) px-3 py-2'>
            <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
              {triggerLabel}
            </span>
            <AppIconButton
              type='button'
              ariaLabel={`Close ${triggerLabel.toLowerCase()} panel`}
              className='border-transparent bg-transparent'
              onClick={() => setIsOpen(false)}
            >
              <X className='h-3.5 w-3.5' />
            </AppIconButton>
          </div>
          <form
            action={action}
            method={isRouteSearch ? 'get' : undefined}
            className='flex flex-col gap-3 p-3'
            onSubmit={event => {
              if (!isRouteSearch) {
                event.preventDefault();
                onApply?.();
              }
              setIsOpen(false);
            }}
          >
            {isRouteSearch
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
            {isRouteSearch ? (
              <input type='hidden' name={searchParamName} value={searchValue} />
            ) : null}
            <AppSearchField
              value={searchValue}
              onChange={onSearchValueChange}
              placeholder={placeholder}
              ariaLabel={ariaLabel}
              autoFocus
              onEscape={() => setIsOpen(false)}
              className='w-full'
              inputClassName='text-[13px]'
            />
            <div className='flex items-center justify-end gap-2'>
              {showClearAction ? (
                isRouteSearch ? (
                  <Button variant='ghost' size='sm' asChild>
                    <Link href={clearHref!} onClick={() => setIsOpen(false)}>
                      Clear
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    aria-label={clearAriaLabel}
                    onClick={handleLocalClear}
                  >
                    Clear
                  </Button>
                )
              ) : null}
              <Button type='submit' variant='secondary' size='sm'>
                {applyLabel}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <form
      action={action}
      method='get'
      className={cn(
        'relative isolate flex w-full items-center gap-2 sm:w-auto',
        className
      )}
    >
      {hiddenInputs.map(input =>
        input.value === undefined || input.value === null ? null : (
          <input
            key={input.name}
            type='hidden'
            name={input.name}
            value={String(input.value)}
          />
        )
      )}
      <input type='hidden' name={searchParamName} value={searchValue} />
      <AppSearchField
        value={searchValue}
        onChange={onSearchValueChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        className={cn(
          'min-w-0 flex-1 sm:w-[260px] sm:flex-none',
          fieldClassName
        )}
      />
      <AppIconButton
        type='submit'
        ariaLabel={submitAriaLabel}
        tooltipLabel={submitAriaLabel}
      >
        {submitIcon}
      </AppIconButton>
      {clearHref && searchValue ? (
        <AppIconButton
          asChild
          ariaLabel={clearAriaLabel}
          tooltipLabel={clearAriaLabel}
        >
          <Link href={clearHref}>{clearIcon}</Link>
        </AppIconButton>
      ) : null}
    </form>
  );
}
