'use client';

import {
  UnifiedTable,
  type UnifiedTableProps,
} from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';

export const ADMIN_DATA_TABLE_CLASSNAME =
  'text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-normal';

export type AdminDataTableProps<TData> = UnifiedTableProps<TData>;

export function AdminDataTable<TData>({
  className,
  enableVirtualization = true,
  rowHeight = 40,
  minWidth = `${TABLE_MIN_WIDTHS.MEDIUM}px`,
  ...props
}: Readonly<AdminDataTableProps<TData>>) {
  return (
    <UnifiedTable<TData>
      {...props}
      className={cn(ADMIN_DATA_TABLE_CLASSNAME, className)}
      enableVirtualization={enableVirtualization}
      rowHeight={rowHeight}
      minWidth={minWidth}
    />
  );
}
