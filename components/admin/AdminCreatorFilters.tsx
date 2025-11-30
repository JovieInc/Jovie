'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import * as React from 'react';

type AdminCreatorProfilesSortClient =
  | 'created_desc'
  | 'created_asc'
  | 'verified_desc'
  | 'verified_asc'
  | 'claimed_desc'
  | 'claimed_asc';

export interface AdminCreatorFiltersProps {
  initialSort: AdminCreatorProfilesSortClient;
  initialPageSize: number;
}

export function AdminCreatorFilters({
  initialSort,
  initialPageSize,
}: AdminCreatorFiltersProps) {
  const [sortValue, setSortValue] =
    React.useState<AdminCreatorProfilesSortClient>(initialSort);
  const [pageSizeValue, setPageSizeValue] = React.useState<string>(
    String(initialPageSize)
  );

  return (
    <div className='flex items-center gap-2 text-xs text-secondary-token'>
      <input type='hidden' name='sort' value={sortValue} />
      <input type='hidden' name='pageSize' value={pageSizeValue} />

      <label className='flex items-center gap-1'>
        <span>Sort</span>
        <Select
          value={sortValue}
          onValueChange={value =>
            setSortValue(value as AdminCreatorProfilesSortClient)
          }
        >
          <SelectTrigger className='h-8 w-36 px-2 text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='created_desc'>Newest</SelectItem>
            <SelectItem value='created_asc'>Oldest</SelectItem>
            <SelectItem value='verified_desc'>Verified first</SelectItem>
            <SelectItem value='verified_asc'>Unverified first</SelectItem>
            <SelectItem value='claimed_desc'>Claimed first</SelectItem>
            <SelectItem value='claimed_asc'>Unclaimed first</SelectItem>
          </SelectContent>
        </Select>
      </label>

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
    </div>
  );
}
