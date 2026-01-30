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

  return (
    <div className='flex items-center gap-2 text-xs text-secondary-token'>
      <input type='hidden' name='pageSize' value={pageSizeValue} />

      {
        // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated with control via DOM structure
        <label className='flex items-center gap-1'>
          <span>Per page</span>
          <Select value={pageSizeValue} onValueChange={setPageSizeValue}>
            <SelectTrigger className='h-8 w-20 px-2 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='10'>10</SelectItem>
              <SelectItem value='20'>20</SelectItem>
              <SelectItem value='50'>50</SelectItem>
            </SelectContent>
          </Select>
        </label>
      }
    </div>
  );
}
