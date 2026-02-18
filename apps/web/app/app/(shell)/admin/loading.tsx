import { PageContent, PageShell } from '@/components/organisms/PageShell';
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
    <PageShell>
      <PageContent>
        <div className='space-y-8'>
          <AdminKpiSectionSkeleton />
          <AdminUsageSectionSkeleton />
          <AdminActivitySectionSkeleton />
        </div>
      </PageContent>
    </PageShell>
  );
}
