'use client';

import { Button } from '@jovie/ui';
import { CheckCircle, RefreshCw, Star, Trash2, XCircle } from 'lucide-react';
import {
  ACTION_BAR_BUTTON_CLASS,
  ActionBar,
  ActionBarItem,
  ExportCSVButton,
} from '@/components/organisms/table';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  CREATORS_CSV_FILENAME_PREFIX,
  creatorsCSVColumns,
} from '@/lib/admin/csv-configs/creators';
import { AdminTableSubheader } from './AdminTableHeader';

export interface AdminCreatorsToolbarProps {
  readonly from: number;
  readonly to: number;
  readonly total: number;
  readonly profiles: AdminCreatorProfileRow[];
  readonly selectedIds?: ReadonlySet<string>;
  readonly onBulkVerify?: () => void;
  readonly onBulkUnverify?: () => void;
  readonly onBulkFeature?: () => void;
  readonly onBulkRefreshMusicFetch?: () => void;
  readonly onBulkDelete?: () => void;
  readonly onClearSelection?: () => void;
}

export function AdminCreatorsToolbar({
  from,
  to,
  total,
  profiles,
  selectedIds = new Set(),
  onBulkVerify,
  onBulkUnverify,
  onBulkFeature,
  onBulkRefreshMusicFetch,
  onBulkDelete,
  onClearSelection,
}: AdminCreatorsToolbarProps) {
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // Get selected profiles to determine available bulk actions
  const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
  const someSelectedVerified = selectedProfiles.some(p => p.isVerified);

  return (
    <AdminTableSubheader>
      <div className='flex min-h-12 w-full flex-wrap items-center gap-2.5'>
        {hasSelection ? (
          // Bulk Actions Mode - replaces "Creator" text
          <>
            <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5'>
              <div className='text-sm font-medium text-primary-token'>
                {selectedCount} {selectedCount === 1 ? 'creator' : 'creators'}{' '}
                selected
              </div>
              <div className='flex w-full flex-wrap items-center gap-1.5 sm:w-auto'>
                {someSelectedVerified ? (
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={onBulkUnverify}
                    className='h-8 gap-2'
                  >
                    <XCircle className='h-3.5 w-3.5' />
                    Unverify
                  </Button>
                ) : (
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={onBulkVerify}
                    className='h-8 gap-2'
                  >
                    <CheckCircle className='h-3.5 w-3.5' />
                    Verify
                  </Button>
                )}
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onBulkFeature}
                  className='h-8 gap-2'
                >
                  <Star className='h-3.5 w-3.5' />
                  Feature
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onBulkRefreshMusicFetch}
                  className='h-8 gap-2'
                >
                  <RefreshCw className='h-3.5 w-3.5' />
                  Refresh Music Data
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={onBulkDelete}
                  className='h-8 gap-2 text-destructive hover:text-destructive'
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
              className='ml-auto h-8'
            >
              Clear Selection
            </Button>
          </>
        ) : (
          // Normal Mode
          <>
            <div className='hidden text-[11px] text-secondary-token tabular-nums md:block'>
              Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
              {total.toLocaleString()} profiles
            </div>
            <div className='flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end'>
              <ActionBar>
                <ActionBarItem tooltipLabel='Export'>
                  <ExportCSVButton<AdminCreatorProfileRow>
                    getData={() => profiles}
                    columns={creatorsCSVColumns}
                    filename={CREATORS_CSV_FILENAME_PREFIX}
                    disabled={profiles.length === 0}
                    ariaLabel='Export creator profiles to CSV file'
                    variant='ghost'
                    size='sm'
                    className={`${ACTION_BAR_BUTTON_CLASS} [&>span]:sr-only`}
                    label='Export'
                  />
                </ActionBarItem>
              </ActionBar>
            </div>
          </>
        )}
      </div>
    </AdminTableSubheader>
  );
}
