'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import * as React from 'react';

export interface AdminCreatorFiltersProps
  extends Readonly<{
    readonly initialPageSize: number;
  }> {}

export function AdminCreatorFilters({
  initialPageSize,
}: Readonly<AdminCreatorFiltersProps>) {
  const [pageSizeValue, setPageSizeValue] = React.useState<string>(
    String(initialPageSize)
  );
  const pageSizeLabelId = React.useId();

  return (
    <div className='flex items-center gap-2 text-[12px] text-(--linear-text-secondary)'>
      <input type='hidden' name='pageSize' value={pageSizeValue} />
      <span id={pageSizeLabelId} className='sr-only'>
        Rows per page
      </span>
      <Select value={pageSizeValue} onValueChange={setPageSizeValue}>
        <SelectTrigger
          aria-labelledby={pageSizeLabelId}
          className='h-8 w-20 rounded-[6px] border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 text-[12px] text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary)'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='10'>10</SelectItem>
          <SelectItem value='20'>20</SelectItem>
          <SelectItem value='50'>50</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
