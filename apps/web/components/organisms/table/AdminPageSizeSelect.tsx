'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import * as React from 'react';

export interface AdminPageSizeSelectProps {
  initialPageSize: number;
  name?: string;
  onPageSizeChange?: (pageSize: number) => void;
}

export function AdminPageSizeSelect({
  initialPageSize,
  name = 'pageSize',
  onPageSizeChange,
}: AdminPageSizeSelectProps) {
  const [pageSizeValue, setPageSizeValue] = React.useState<string>(
    String(initialPageSize)
  );

  return (
    <div className='flex items-center gap-2 text-xs text-secondary-token'>
      <input type='hidden' name={name} value={pageSizeValue} />
      {
        // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated with control via DOM structure
        <label className='flex items-center gap-1'>
          <span>Rows per page</span>
          <Select
            value={pageSizeValue}
            onValueChange={nextValue => {
              setPageSizeValue(nextValue);
              const parsed = Number.parseInt(nextValue, 10);
              if (Number.isFinite(parsed) && parsed > 0) {
                onPageSizeChange?.(parsed);
              }
            }}
          >
            <SelectTrigger className='h-8 w-20 px-2 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='bg-white dark:bg-[#101011] text-primary-token dark:text-[#e3e5e9] border border-subtle dark:border-[#1f2022]'>
              <SelectItem
                value='10'
                className='text-primary-token dark:text-[#e3e5e9] data-highlighted:bg-[#f2f2f2] dark:data-highlighted:bg-[#151618] data-highlighted:text-primary-token dark:data-highlighted:text-white'
              >
                10
              </SelectItem>
              <SelectItem
                value='20'
                className='text-primary-token dark:text-[#e3e5e9] data-highlighted:bg-[#f2f2f2] dark:data-highlighted:bg-[#151618] data-highlighted:text-primary-token dark:data-highlighted:text-white'
              >
                20
              </SelectItem>
              <SelectItem
                value='50'
                className='text-primary-token dark:text-[#e3e5e9] data-highlighted:bg-[#f2f2f2] dark:data-highlighted:bg-[#151618] data-highlighted:text-primary-token dark:data-highlighted:text-white'
              >
                50
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
      }
    </div>
  );
}
