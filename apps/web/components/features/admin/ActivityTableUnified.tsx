'use client';

import { Activity } from 'lucide-react';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  UnifiedTable,
} from '@/components/organisms/table';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import type { AdminActivityItem } from '@/lib/admin/types';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { ACTIVITY_COLUMNS } from './activity-table/activityColumns';

interface ActivityTableUnifiedProps {
  readonly items: AdminActivityItem[];
}

/** Standard row class for activity table */
const getRowClassName = () => 'group hover:bg-(--linear-row-hover)';

export function ActivityTableUnified({
  items,
}: Readonly<ActivityTableUnifiedProps>) {
  return (
    <div
      className='h-full border-0 bg-(--linear-app-content-surface)'
      data-testid='admin-activity-content'
    >
      <AdminTableSubheader
        start={<p className={PAGE_TOOLBAR_META_TEXT_CLASS}>Last 7 days.</p>}
      />
      <div className='overflow-x-auto'>
        <UnifiedTable
          data={items}
          columns={ACTIVITY_COLUMNS}
          isLoading={false}
          emptyState={
            <div className='flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-secondary-token'>
              <Activity className='h-6 w-6' />
              <div>
                <div className='font-medium text-primary-token'>
                  No recent activity
                </div>
                <div className='text-xs text-secondary-token'>
                  Activity from the last 7 days will appear here.
                </div>
              </div>
            </div>
          }
          getRowId={row => row.id}
          getRowClassName={getRowClassName}
          enableVirtualization={true}
          minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
          className='text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-[10px] [&_thead_th]:tracking-[0.07em]'
        />
      </div>
    </div>
  );
}
