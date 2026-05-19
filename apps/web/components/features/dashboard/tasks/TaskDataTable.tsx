'use client';

import { useCallback } from 'react';
import {
  UnifiedTable,
  type UnifiedTableProps,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';

export const TASK_DATA_TABLE_CLASSNAME = 'text-app';

export const TASK_DATA_TABLE_CONTAINER_CLASSNAME =
  'h-full overflow-y-auto overflow-x-hidden px-2.5 pb-2 pt-0.5';

export const TASK_DATA_TABLE_ROW_CLASSNAME =
  'group/row group/task-row bg-transparent shadow-none hover:bg-transparent focus-within:shadow-none focus-visible:bg-transparent focus-visible:shadow-none';

export type TaskDataTableProps<TData> = UnifiedTableProps<TData>;

export function TaskDataTable<TData>({
  className,
  containerClassName,
  enableVirtualization = false,
  getRowClassName,
  hideHeader = true,
  minWidth = '100%',
  rowHeight = 64,
  skeletonRows = 8,
  ...props
}: Readonly<TaskDataTableProps<TData>>) {
  const mergedRowClassName = useCallback(
    (row: TData, index: number) =>
      cn(TASK_DATA_TABLE_ROW_CLASSNAME, getRowClassName?.(row, index)),
    [getRowClassName]
  );

  return (
    <UnifiedTable<TData>
      {...props}
      className={cn(TASK_DATA_TABLE_CLASSNAME, className)}
      containerClassName={cn(
        TASK_DATA_TABLE_CONTAINER_CLASSNAME,
        containerClassName
      )}
      enableVirtualization={enableVirtualization}
      getRowClassName={mergedRowClassName}
      hideHeader={hideHeader}
      minWidth={minWidth}
      rowHeight={rowHeight}
      skeletonRows={skeletonRows}
    />
  );
}
