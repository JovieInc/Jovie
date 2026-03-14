import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminBraggingRightsSectionSkeleton,
  AdminKpiSectionSkeleton,
  AdminOutreachSectionSkeleton,
  AdminPlatformStatsSectionSkeleton,
  AdminSentrySectionSkeleton,
  AdminUsageSectionSkeleton,
} from './_components';

/**
 * Admin loading screen — matches admin page layout with skeleton sections.
 */
export default function AdminLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='flex h-full flex-col gap-6'>
          <AdminBraggingRightsSectionSkeleton />
          <AdminKpiSectionSkeleton />
          <div className='overflow-hidden rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-0'>
            <div className='border-b border-(--linear-border-subtle) px-[var(--linear-app-header-padding-x)] py-3'>
              <div className='h-4 w-40 rounded skeleton' />
              <div className='mt-2 h-3 w-56 rounded skeleton' />
            </div>
            <div className='border-t border-(--linear-border-subtle) px-[var(--linear-app-header-padding-x)] py-4'>
              <AdminPlatformStatsSectionSkeleton />
            </div>
          </div>
          <div className='grid min-h-0 flex-1 gap-6 lg:grid-cols-3'>
            <div className='lg:col-span-2'>
              <AdminOutreachSectionSkeleton />
            </div>
            <div>
              <AdminUsageSectionSkeleton />
            </div>
          </div>
          <AdminSentrySectionSkeleton />
        </div>
      </PageContent>
    </PageShell>
  );
}
