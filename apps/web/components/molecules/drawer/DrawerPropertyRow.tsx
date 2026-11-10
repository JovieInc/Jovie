'use client';

import { Check, Copy } from 'lucide-react';
import { type CSSProperties, type ReactNode, useMemo } from 'react';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { cn } from '@/lib/utils';

type DrawerPropertyRowStyle = CSSProperties & {
  gridTemplateColumns: string;
};

export interface DrawerPropertyRowProps {
  readonly definitionList?: boolean;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly labelWidth?: number;
  readonly size?: 'sm' | 'md';
  readonly align?: 'center' | 'start';
  readonly interactive?: boolean;
  readonly onClick?: () => void;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly className?: string;
  /**
   * Copy-on-click for the value (founder note 2026-11-09: identifiers and
   * form-filing values copy on click of the value itself). Defaults on for
   * plain-string values; off for interactive rows, ReactNode values, and
   * any row that opts out.
   */
  readonly copyable?: boolean;
  /**
   * What the copy writes when it differs from the displayed value
   * (e.g. an unformatted identifier behind a formatted display).
   */
  readonly copyText?: string;
}

export function DrawerPropertyRow({
  definitionList = false,
  label,
  value,
  labelWidth,
  size = 'md',
  align = 'center',
  interactive = false,
  onClick,
  labelClassName,
  valueClassName,
  className,
  copyable,
  copyText,
}: DrawerPropertyRowProps) {
  const Wrapper = interactive ? 'button' : 'div';
  const Label = definitionList ? 'dt' : 'span';
  const Value = definitionList ? 'dd' : 'span';

  const notifications = useNotifications();
  const { copy, isSuccess, isError } = useClipboard({
    resetDelay: 2000,
    onSuccess: () =>
      notifications.success(
        `${typeof label === 'string' ? label : 'Value'} copied`
      ),
    onError: () => notifications.error('Could not copy to the clipboard'),
  });

  // Copy-on-click applies to plain-string values only: interactive controls
  // (dropdowns, toggles, action buttons) arrive as ReactNode and keep their
  // own behavior, and interactive rows own the whole click surface already.
  const isCopyable =
    !interactive &&
    (copyable ?? true) &&
    typeof value === 'string' &&
    value.trim().length > 0;

  const sizeClasses = {
    sm: {
      container: 'min-h-6 gap-2 rounded-md px-0 py-px',
      label: 'text-2xs leading-[15px] tracking-normal',
      value: 'text-xs leading-4 tracking-normal',
    },
    md: {
      container: 'min-h-6 gap-2 rounded-md px-0 py-0.5',
      label: 'text-2xs leading-[15px] tracking-normal',
      value: 'text-xs leading-4 tracking-normal',
    },
  } as const;

  const styles = sizeClasses[size];

  const gridStyle = useMemo<DrawerPropertyRowStyle>(
    () => ({
      gridTemplateColumns:
        typeof labelWidth === 'number'
          ? `${labelWidth}px minmax(0, 1fr)`
          : 'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
    }),
    [labelWidth]
  );

  const valueContent = isCopyable ? (
    <button
      type='button'
      aria-label={`Copy ${typeof label === 'string' ? label : 'value'}: ${value}`}
      title='Click to copy'
      data-copy-value={isSuccess ? 'success' : isError ? 'error' : 'idle'}
      onClick={event => {
        event.stopPropagation();
        void copy(copyText ?? value);
      }}
      className={cn(
        'group/copy inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
      )}
    >
      <span className='min-w-0 truncate'>{value}</span>
      {isSuccess ? (
        <Check
          className='h-3 w-3 shrink-0 text-primary-token'
          aria-hidden='true'
        />
      ) : (
        <Copy
          className='h-3 w-3 shrink-0 text-tertiary-token opacity-0 transition-opacity duration-subtle group-hover/copy:opacity-100 focus-visible:opacity-100 motion-reduce:opacity-60'
          aria-hidden='true'
        />
      )}
    </button>
  ) : (
    value
  );

  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cn(
        'grid w-full text-left transition-[background-color] duration-subtle',
        align === 'start' ? 'items-start' : 'items-center',
        styles.container,
        interactive &&
          'cursor-pointer hover:bg-surface-1/80 focus-visible:bg-surface-1/80 focus-visible:outline-none',
        className
      )}
      style={gridStyle}
    >
      <Label
        className={cn(
          'font-[500] text-quaternary-token',
          styles.label,
          labelClassName
        )}
      >
        {label}
      </Label>
      <Value
        className={cn(
          'min-w-0 font-[460] text-primary-token',
          styles.value,
          valueClassName
        )}
      >
        {valueContent}
      </Value>
    </Wrapper>
  );
}
