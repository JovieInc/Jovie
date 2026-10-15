'use client';
// @coverage-via apps/web/tests/unit/components/admin/AdminDataTable.test.tsx

import {
  UnifiedTable,
  type UnifiedTableProps,
} from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import type { RowData } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

export const ADMIN_DATA_TABLE_CLASSNAME =
  'text-xs [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-normal';

export type AdminDataTableProps<TData extends RowData> = Omit<
  UnifiedTableProps<TData>,
  'columnSizing'
>;

export function AdminDataTable<TData extends RowData>({
  className,
  enableVirtualization = true,
  rowHeight,
  rowMode = rowHeight === undefined ? 'compact' : undefined,
  containerClassName,
  minWidth = `${TABLE_MIN_WIDTHS.MEDIUM}px`,
  columnSnap = false,
  ...props
}: Readonly<AdminDataTableProps<TData>>) {
  return (
    <UnifiedTable<TData>
      {...props}
      className={cn(ADMIN_DATA_TABLE_CLASSNAME, className)}
      columnSnap={columnSnap}
      enableVirtualization={enableVirtualization}
      columnSizing='schema'
      containerClassName={cn('min-h-0 flex-1', containerClassName)}
      rowHeight={rowHeight}
      rowMode={rowMode}
      minWidth={minWidth}
    />
  );
}
