'use client';

import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
import { SKELETON_ROW_COUNT, TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import {
  AUDIENCE_TABLE_CONTAINER_CLASS,
  AUDIENCE_TABLE_SKELETON_COLUMN_CONFIG,
  buildAudienceMemberColumns,
} from './table-config';

const AUDIENCE_LOADING_TAB_KEYS = ['all', 'identified', 'anonymous'] as const;
const AUDIENCE_MOBILE_ROW_KEYS = Array.from(
  { length: SKELETON_ROW_COUNT.MOBILE },
  (_, i) => `audience-mobile-${i + 1}`
);
const AUDIENCE_LOADING_COLUMNS = buildAudienceMemberColumns('members');

export function AudienceTableLoadingShell() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Audience'
      data-testid='dashboard-audience-loading'
      surfaceMode='table'
      toolbar={
        <PageToolbar
          start={
            <div className='flex flex-wrap items-center gap-1'>
              {AUDIENCE_LOADING_TAB_KEYS.map(key => (
                <LoadingSkeleton
                  key={key}
                  height='h-8'
                  width='w-24'
                  rounded='md'
                />
              ))}
            </div>
          }
          end={
            <>
              <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
              <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
            </>
          }
        />
      }
    >
      <div className='flex-1 min-h-0 overflow-hidden bg-(--linear-app-content-surface)'>
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex-1 min-h-0 overflow-hidden sm:hidden'>
            <div className='divide-y divide-(--linear-border-subtle)'>
              {AUDIENCE_MOBILE_ROW_KEYS.map(key => (
                <div key={key} className='flex items-center gap-3 px-4 py-3'>
                  <LoadingSkeleton
                    height='h-9'
                    width='w-9'
                    rounded='full'
                    className='shrink-0'
                  />
                  <div className='flex-1 min-w-0 space-y-1.5'>
                    <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                    <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
                  </div>
                  <LoadingSkeleton
                    height='h-3'
                    width='w-14'
                    rounded='sm'
                    className='shrink-0'
                  />
                </div>
              ))}
            </div>
          </div>

          <div className='max-sm:hidden flex-1 min-h-0 overflow-hidden'>
            <UnifiedTableSkeleton
              columns={AUDIENCE_LOADING_COLUMNS}
              skeletonRows={SKELETON_ROW_COUNT.TABLE}
              skeletonColumnConfig={AUDIENCE_TABLE_SKELETON_COLUMN_CONFIG}
              rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
              minWidth='800px'
              className='text-app'
              containerClassName={AUDIENCE_TABLE_CONTAINER_CLASS}
            />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
