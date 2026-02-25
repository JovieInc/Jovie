import {
  AdminActivitySectionSkeleton,
  AdminKpiSectionSkeleton,
  AdminUsageSectionSkeleton,
} from './_components';

/**
 * Admin loading screen — matches admin page layout with 3 skeleton sections.
 */
export default function AdminLoading() {
  return (
    <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6'>
      <div className='space-y-8'>
        <AdminKpiSectionSkeleton />
        <AdminUsageSectionSkeleton />
        <AdminActivitySectionSkeleton />
      </div>
    </div>
  );
}
