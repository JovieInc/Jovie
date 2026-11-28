import { cn } from '@jovie/ui/lib/utils';
import type {
  ComponentPropsWithoutRef,
  ElementType,
  MouseEvent,
  ReactNode,
} from 'react';
import {
  APP_TABLE_CELL_ATTR,
  APP_TABLE_CELL_CONTENT_CLASSNAME,
  APP_TABLE_MEDIA_CLASSNAME,
  APP_TABLE_MEDIA_SIZE,
  APP_TABLE_NUMERIC_CLASSNAME,
  type AppTableMediaSize,
} from './app-table-row';

/**
 * Canonical inner host for every app table/list cell. Prefer this (or
 * `TABLE_CELL_CONTENT_CLASSNAME`, which aliases the same classes) over
 * ad-hoc `block` + baseline text wrappers — those sit media high against
 * title glyphs and fail the geometric alignment gate.
 */
export function AppTableCellContent({
  className,
  align = 'start',
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  readonly align?: 'start' | 'center' | 'end';
}) {
  return (
    <div
      {...props}
      data-table-cell-content='stable'
      data-app-table-cell='content'
      className={cn(
        APP_TABLE_CELL_CONTENT_CLASSNAME,
        align === 'center' && 'justify-center',
        align === 'end' && 'justify-end',
        className
      )}
    />
  );
}

export function AppTableMediaCell({
  size = APP_TABLE_MEDIA_SIZE.dense,
  className,
  style,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  readonly size?: AppTableMediaSize;
}) {
  return (
    <div
      {...props}
      data-app-table-cell='media'
      className={cn(APP_TABLE_MEDIA_CLASSNAME, className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}

export function AppTableTextCell({
  tone = 'primary',
  copyValue,
  copyLabel = 'Value',
  truncate = true,
  className,
  title,
  as,
  onClick,
  children,
  ...props
}: {
  readonly tone?: 'primary' | 'meta';
  /** When set, click copies this value. Nested controls keep their own handlers. */
  readonly copyValue?: string;
  readonly copyLabel?: string;
  /** Ellipsis truncate (default). Set false when the column sizes to content. */
  readonly truncate?: boolean;
  readonly as?: ElementType;
  readonly className?: string;
  readonly title?: string;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  readonly children?: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<'span'>,
  'className' | 'title' | 'onClick' | 'children'
>) {
  const Comp: ElementType = as ?? (copyValue ? 'button' : 'span');
  const isButton = Comp === 'button';

  return (
    <Comp
      {...props}
      type={isButton ? 'button' : undefined}
      onClick={(event: MouseEvent<HTMLElement>) => {
        if (copyValue) {
          event.stopPropagation();
          void navigator.clipboard.writeText(copyValue).catch(() => {});
        }
        onClick?.(event);
      }}
      title={title ?? (typeof children === 'string' ? children : undefined)}
      aria-label={
        copyValue ? `Copy ${copyLabel}: ${copyValue}` : props['aria-label']
      }
      data-app-table-cell={tone === 'meta' ? 'meta' : 'text'}
      className={cn(
        tone === 'meta'
          ? 'block min-w-0 text-2xs leading-none text-tertiary-token'
          : 'block min-w-0 text-app font-caption leading-none text-primary-token',
        truncate ? 'truncate' : 'overflow-visible whitespace-nowrap',
        isButton &&
          'cursor-copy border-0 bg-transparent p-0 text-left hover:text-primary-token',
        className
      )}
    >
      {children}
    </Comp>
  );
}

export function AppTableNumericCell({
  className,
  copyValue,
  copyLabel = 'Value',
  title,
  children,
  ...props
}: {
  readonly copyValue?: string;
  readonly copyLabel?: string;
  readonly className?: string;
  readonly title?: string;
  readonly children?: ReactNode;
} & Omit<
  ComponentPropsWithoutRef<'span'>,
  'className' | 'title' | 'children'
>) {
  if (copyValue) {
    return (
      <button
        {...props}
        type='button'
        data-app-table-cell='numeric'
        title={title ?? (typeof children === 'string' ? children : undefined)}
        aria-label={`Copy ${copyLabel}: ${copyValue}`}
        onClick={event => {
          event.stopPropagation();
          void navigator.clipboard.writeText(copyValue).catch(() => {});
        }}
        className={cn(
          APP_TABLE_NUMERIC_CLASSNAME,
          'cursor-copy border-0 bg-transparent p-0 hover:text-primary-token',
          className
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <span
      {...props}
      data-app-table-cell='numeric'
      title={title ?? (typeof children === 'string' ? children : undefined)}
      className={cn(APP_TABLE_NUMERIC_CLASSNAME, className)}
    >
      {children}
    </span>
  );
}

// Keep the attr constant referenced so tree-shaking never drops the contract.
void APP_TABLE_CELL_ATTR;
