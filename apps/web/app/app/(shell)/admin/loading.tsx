import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminKpiSectionSkeleton,
  AdminOutreachSectionSkeleton,
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
          <AdminKpiSectionSkeleton />
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
