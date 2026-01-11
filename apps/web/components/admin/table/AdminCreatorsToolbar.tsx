'use client';

import { Button, Input } from '@jovie/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ExportCSVButton } from '@/components/admin/table/molecules/ExportCSVButton';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  CREATORS_CSV_FILENAME_PREFIX,
  creatorsCSVColumns,
} from '@/lib/admin/csv-configs/creators';

export interface AdminCreatorsToolbarProps {
  basePath: string;
  search: string;
  sort: string;
  pageSize: number;
  from: number;
  to: number;
  total: number;
  clearHref: string;
  profiles: AdminCreatorProfileRow[];
}

export function AdminCreatorsToolbar({
  basePath,
  search,
  sort,
  pageSize,
  from,
  to,
  total,
  clearHref,
  profiles,
}: AdminCreatorsToolbarProps) {
  const [searchTerm, setSearchTerm] = useState(search);

  return (
    <div className='flex h-14 w-full items-center gap-3 px-4'>
      <div className='hidden sm:block text-xs text-secondary-token'>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
        {total.toLocaleString()} profiles
      </div>
      <div className='ml-auto flex items-center gap-3'>
        <form
          action={basePath}
          method='get'
          className='relative isolate flex items-center gap-2'
        >
          <input type='hidden' name='sort' value={sort} />
          <input type='hidden' name='pageSize' value={pageSize} />
          <Input
            name='q'
            placeholder='Search by handle'
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className='w-[240px]'
          />
          <input type='hidden' name='page' value='1' />
          <Button type='submit' size='sm' variant='secondary'>
            Search
          </Button>
          {search && search.length > 0 && (
            <Button asChild size='sm' variant='ghost'>
              <Link href={clearHref}>Clear</Link>
            </Button>
          )}
        </form>
        <ExportCSVButton<AdminCreatorProfileRow>
          getData={() => profiles}
          columns={creatorsCSVColumns}
          filename={CREATORS_CSV_FILENAME_PREFIX}
          disabled={profiles.length === 0}
          ariaLabel='Export creator profiles to CSV file'
        />
      </div>
    </div>
  );
}
