'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { cn } from '@/lib/utils';

interface HiddenInput {
  readonly name: string;
  readonly value: string | number | null | undefined;
}

export interface PageToolbarSearchFormProps {
  readonly action: string;
  readonly searchValue: string;
  readonly onSearchValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly submitAriaLabel: string;
  readonly clearHref?: string;
  readonly clearAriaLabel?: string;
  readonly hiddenInputs?: readonly HiddenInput[];
  readonly searchParamName?: string;
  readonly className?: string;
  readonly fieldClassName?: string;
  readonly submitIcon: ReactNode;
  readonly clearIcon: ReactNode;
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
  hiddenInputs = [],
  searchParamName = 'q',
  className,
  fieldClassName,
  submitIcon,
  clearIcon,
}: Readonly<PageToolbarSearchFormProps>) {
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
