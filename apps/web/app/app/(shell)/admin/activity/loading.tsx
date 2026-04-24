import { ACTIVITY_COLUMNS } from '@/components/features/admin/activity-table/activityColumns';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { UnifiedTableSkeleton } from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';

const activityTabs = [{ value: 'activity', label: 'Activity' }] as const;

export function AdminActivitySkeleton() {
  return (
    <div
      className='h-full overflow-hidden rounded-xl border border-subtle bg-(--linear-app-content-surface)'
      aria-busy='true'
    >
      <ContentSectionHeaderSkeleton titleWidth='w-36' descriptionWidth='w-24' />

      <div className='px-0 pt-0'>
        <div className='overflow-x-auto'>
          <UnifiedTableSkeleton
            columns={ACTIVITY_COLUMNS}
            skeletonRows={8}
            minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
            className='text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-[10px] [&_thead_th]:tracking-[0.07em]'
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminActivityLoading() {
  return (
    <AdminWorkspacePage
      title='Activity'
      description='Recent admin interventions, creator events, and system outcomes.'
      primaryParam='view'
      primaryValue='activity'
      primaryOptions={activityTabs}
      testId='admin-activity-page'
      viewTestId='admin-activity-view'
    >
      <AdminActivitySkeleton />
    </AdminWorkspacePage>
  );
}
