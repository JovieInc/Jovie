import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { cn } from '@/lib/utils';

export const CONTENT_TABLE_WRAPPER_CLASS = 'overflow-x-auto px-4 py-4 sm:px-6';
export const CONTENT_TABLE_CLASS = 'w-full text-[12px] text-secondary-token';
export const CONTENT_TABLE_HEAD_ROW_CLASS = 'border-b border-subtle text-left';
export const CONTENT_TABLE_HEAD_CELL_CLASS =
  'pb-2 pr-3 text-2xs font-semibold tracking-[0.01em] text-tertiary-token';
export const CONTENT_TABLE_ROW_CLASS =
  'border-b border-subtle transition-colors hover:bg-surface-0';
export const CONTENT_TABLE_CELL_CLASS = 'py-2.5 pr-3 align-middle';
export const CONTENT_TABLE_FOOTER_CLASS =
  'border-t border-subtle px-4 py-2.5 sm:px-6';

interface ContentTableProps extends ComponentPropsWithoutRef<'table'> {
  readonly wrapperClassName?: string;
}

export function ContentTable({
  className,
  wrapperClassName,
  children,
  ...props
}: Readonly<ContentTableProps>) {
  return (
    <div className={cn(CONTENT_TABLE_WRAPPER_CLASS, wrapperClassName)}>
      <table className={cn(CONTENT_TABLE_CLASS, className)} {...props}>
        {children}
      </table>
    </div>
  );
}

interface ContentTableStateRowProps {
  readonly colSpan: number;
  readonly isLoading?: boolean;
  readonly emptyMessage: ReactNode;
  readonly loadingLabel?: string;
}

export function ContentTableStateRow({
  colSpan,
  isLoading = false,
  emptyMessage,
  loadingLabel = 'Loading rows',
}: Readonly<ContentTableStateRowProps>) {
  return (
    <tr>
      <td colSpan={colSpan} className='px-0 py-8 text-center align-middle'>
        {isLoading ? (
          <output
            className='flex items-center justify-center'
            aria-busy='true'
            aria-live='polite'
          >
            <LoadingSpinner size='sm' tone='muted' />
            <span className='sr-only'>{loadingLabel}</span>
          </output>
        ) : (
          <p className='text-[12px] leading-[18px] text-secondary-token'>
            {emptyMessage}
          </p>
        )}
      </td>
    </tr>
  );
}
