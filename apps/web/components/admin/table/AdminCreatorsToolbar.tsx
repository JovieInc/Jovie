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
  basePath: string;
  search: string;
  sort: string;
  pageSize: number;
  from: number;
  to: number;
  total: number;
  clearHref: string;
  profiles: AdminCreatorProfileRow[];
  selectedIds?: Set<string>;
  onBulkVerify?: () => void;
  onBulkUnverify?: () => void;
  onBulkFeature?: () => void;
  onBulkDelete?: () => void;
  onClearSelection?: () => void;
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
    <div className='flex h-14 w-full items-center gap-3 px-4'>
      {hasSelection ? (
        // Bulk Actions Mode - replaces "Creator" text
        <>
          <div className='flex items-center gap-3'>
            <div className='text-sm font-medium text-primary-token'>
              {selectedCount} {selectedCount === 1 ? 'creator' : 'creators'}{' '}
              selected
            </div>
            <div className='flex items-center gap-2'>
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
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchTerm(event.target.value)
                }
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
        </>
      )}
    </div>
  );
}
