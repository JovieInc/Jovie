import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminKpiSectionSkeleton,
  AdminOutreachSectionSkeleton,
  AdminUsageSectionSkeleton,
} from './_components';

/**
 * Admin loading screen — matches admin page layout with skeleton sections.
 */
export default function AdminLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='flex h-full flex-col gap-4'>
          <div className='grid gap-4 lg:grid-cols-2 xl:grid-cols-4'>
            {Array.from({ length: 4 }, (_, index) => `overview-${index}`).map(
              key => (
                <div
                  key={key}
                  className='h-[172px] rounded-xl border border-subtle bg-surface-1 skeleton'
                />
              )
            )}
          </div>
          <AdminKpiSectionSkeleton />
          <div className='grid min-h-0 flex-1 gap-4 lg:grid-cols-3'>
            <div className='lg:col-span-2'>
              <AdminOutreachSectionSkeleton />
            </div>
            <div>
              <AdminUsageSectionSkeleton />
            </div>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
