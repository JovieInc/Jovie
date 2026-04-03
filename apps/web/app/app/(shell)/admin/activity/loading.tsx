import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';

const ADMIN_ACTIVITY_ROW_KEYS = Array.from(
  { length: 8 },
  (_, i) => `activity-row-${i + 1}`
);
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
          <table className='w-full border-collapse text-sm'>
            <thead className='text-left'>
              <tr className='border-b border-subtle text-xs uppercase tracking-wide text-tertiary-token'>
                <th className='px-4 py-3'>
                  <div className='h-3 w-12 rounded skeleton' />
                </th>
                <th className='px-4 py-3'>
                  <div className='h-3 w-14 rounded skeleton' />
                </th>
                <th className='max-md:hidden px-4 py-3 md:table-cell'>
                  <div className='h-3 w-20 rounded skeleton' />
                </th>
                <th className='px-4 py-3 text-right'>
                  <div className='ml-auto h-3 w-12 rounded skeleton' />
                </th>
              </tr>
            </thead>
            <tbody>
              {ADMIN_ACTIVITY_ROW_KEYS.map(key => (
                <tr
                  key={key}
                  className='border-b border-subtle last:border-b-0'
                >
                  <td className='px-4 py-3'>
                    <div className='h-4 w-20 rounded skeleton' />
                  </td>
                  <td className='px-4 py-3'>
                    <div className='h-4 w-64 max-w-[60vw] rounded skeleton' />
                  </td>
                  <td className='max-md:hidden px-4 py-3 md:table-cell'>
                    <div className='h-4 w-36 rounded skeleton' />
                  </td>
                  <td className='px-4 py-3'>
                    <div className='ml-auto h-6 w-20 rounded-full skeleton' />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
