'use client';

import * as React from 'react';
import { AddLinkButton } from '@/components/atoms/AddLinkButton';
import { LinkSearch } from '@/components/atoms/LinkSearch';
import { cn } from '@/lib/utils';

interface LinkToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddLink: () => void;
  totalCount: number;
  filteredCount?: number;
  className?: string;
}

export function LinkToolbar({
  searchValue,
  onSearchChange,
  onAddLink,
  totalCount,
  filteredCount,
  className,
}: LinkToolbarProps) {
  const showFilteredCount =
    filteredCount !== undefined && filteredCount !== totalCount;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between',
        className
      )}
    >
      {/* Left side - Search and count */}
      <div className='flex-1 max-w-md'>
        <LinkSearch
          value={searchValue}
          onChange={onSearchChange}
          placeholder='Search your links...'
        />
        {totalCount > 0 && (
          <p className='text-sm text-muted-foreground mt-2'>
            {showFilteredCount ? (
              <>
                Showing {filteredCount} of {totalCount} links
              </>
            ) : (
              <>
                {totalCount} {totalCount === 1 ? 'link' : 'links'} total
              </>
            )}
          </p>
        )}
      </div>

      {/* Right side - Add button */}
      <div className='shrink-0'>
        <AddLinkButton onClick={onAddLink} size='default' />
      </div>
    </div>
  );
}
