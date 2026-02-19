'use client';

import { Button, Input } from '@jovie/ui';
import { CheckCircle, Star, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ExportCSVButton } from '@/components/organisms/table';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  CREATORS_CSV_FILENAME_PREFIX,
  creatorsCSVColumns,
} from '@/lib/admin/csv-configs/creators';

export interface AdminCreatorsToolbarProps {
  readonly basePath: string;
  readonly search: string;
  readonly sort: string;
  readonly pageSize: number;
  readonly from: number;
  readonly to: number;
  readonly total: number;
  readonly clearHref: string;
  readonly profiles: AdminCreatorProfileRow[];
  readonly selectedIds?: ReadonlySet<string>;
  readonly onBulkVerify?: () => void;
  readonly onBulkUnverify?: () => void;
  readonly onBulkFeature?: () => void;
  readonly onBulkDelete?: () => void;
  readonly onClearSelection?: () => void;
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
  selectedIds = new Set(),
  onBulkVerify,
  onBulkUnverify,
  onBulkFeature,
  onBulkDelete,
  onClearSelection,
}: AdminCreatorsToolbarProps) {
  const [searchTerm, setSearchTerm] = useState(search);
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // Get selected profiles to determine available bulk actions
  const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
  const someSelectedVerified = selectedProfiles.some(p => p.isVerified);

  return (
    <div className='flex min-h-14 w-full flex-wrap items-center gap-3 px-3 py-2 sm:px-4 sm:py-0'>
      {hasSelection ? (
        // Bulk Actions Mode - replaces "Creator" text
        <>
          <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3'>
            <div className='text-sm font-medium text-primary-token'>
              {selectedCount} {selectedCount === 1 ? 'creator' : 'creators'}{' '}
              selected
            </div>
            <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
              {someSelectedVerified ? (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onBulkUnverify}
                  className='gap-2.5'
                >
                  <XCircle className='h-3.5 w-3.5' />
                  Unverify
                </Button>
              ) : (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onBulkVerify}
                  className='gap-2.5'
                >
                  <CheckCircle className='h-3.5 w-3.5' />
                  Verify
                </Button>
              )}
              <Button
                size='sm'
                variant='ghost'
                onClick={onBulkFeature}
                className='gap-2.5'
              >
                <Star className='h-3.5 w-3.5' />
                Feature
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={onBulkDelete}
                className='gap-2.5 text-destructive hover:text-destructive'
              >
                <Trash2 className='h-3.5 w-3.5' />
                Delete
              </Button>
            </div>
          </div>
          <Button
            size='sm'
            variant='ghost'
            onClick={onClearSelection}
            className='ml-auto'
          >
            Clear Selection
          </Button>
        </>
      ) : (
        // Normal Mode
        <>
          <div className='hidden text-xs text-secondary-token tabular-nums md:block'>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()} profiles
          </div>
          <div className='flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:gap-3'>
            <form
              action={basePath}
              method='get'
              className='relative isolate flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap'
            >
              <input type='hidden' name='sort' value={sort} />
              <input type='hidden' name='pageSize' value={pageSize} />
              <Input
                name='q'
                placeholder='Search by handle'
                value={searchTerm}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchTerm(event.target.value)
                }
                className='w-full sm:w-[240px]'
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
        </>
      )}
    </div>
  );
}
