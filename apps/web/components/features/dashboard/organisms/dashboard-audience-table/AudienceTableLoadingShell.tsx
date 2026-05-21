'use client';

import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
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
    <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-32'
        actionWidths={['w-8', 'w-8']}
        className='bg-(--linear-app-content-surface)'
      />

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
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
            <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
          </>
        }
      />

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

          <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-(--linear-app-content-surface)/95 px-4 py-2 text-xs text-secondary-token backdrop-blur-md sm:px-6 supports-[backdrop-filter]:bg-(--linear-app-content-surface)/85'>
            <LoadingSkeleton
              height='h-4'
              width='w-48'
              rounded='md'
              className='max-sm:hidden'
            />
            <LoadingSkeleton
              height='h-4'
              width='w-24'
              rounded='md'
              className='sm:hidden'
            />
            <div className='flex items-center gap-3'>
              <LoadingSkeleton
                height='h-8'
                width='w-28'
                rounded='md'
                className='max-sm:hidden'
              />
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-8' width='w-20' rounded='md' />
                <LoadingSkeleton height='h-8' width='w-16' rounded='md' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
