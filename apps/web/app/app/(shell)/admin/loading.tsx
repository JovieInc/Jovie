import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { AdminHealthDashboardSkeleton } from './_components/AdminHealthDashboard';

/**
 * Admin loading screen — matches Overview health dashboard layout.
 */
export default function AdminLoading() {
  return (
    <PageShell frame='none' contentPadding='none'>
      <PageContent>
        <div className='flex h-full flex-col gap-4'>
          <AdminHealthDashboardSkeleton />
        </div>
      </PageContent>
    </PageShell>
  );
}
