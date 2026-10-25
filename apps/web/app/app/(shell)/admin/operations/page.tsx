import type { Metadata } from 'next';
import { HudSystemHealthStrip } from '@/components/features/admin/hud/HudSystemHealthStrip';
import { OperationalTasksPanel } from '@/components/features/admin/hud/OperationalTasksPanel';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getHudMetrics } from '@/lib/hud/metrics';

export const metadata: Metadata = { title: 'Operations | Ovie' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  await requireCurrentAdminPageAccess();
  const metrics = await getHudMetrics('admin');

  return (
    <AdminPage
      title='Operations'
      description='Autonomous company outcomes and exceptions. Active remediation stays attached to the work.'
      testId='founder-operations-page'
    >
      <HudSystemHealthStrip metrics={metrics} presentation='page' />
      <OperationalTasksPanel presentation='page' />
      <nav aria-label='Related Operations'>
        <h2 className='line-clamp-2 text-app font-semibold text-primary-token'>
          Inspect The Operating System
        </h2>
        <div className='mt-2 flex flex-wrap gap-3 text-2xs font-medium'>
          <a
            className='text-secondary-token hover:text-primary-token'
            href={APP_ROUTES.ADMIN_COSTS}
          >
            Costs →
          </a>
          <a
            className='text-secondary-token hover:text-primary-token'
            href={APP_ROUTES.ADMIN_SYSTEM}
          >
            Systems and agents →
          </a>
          <a
            className='text-secondary-token hover:text-primary-token'
            href={APP_ROUTES.ADMIN_ACTIVITY}
          >
            Outcome timeline →
          </a>
        </div>
      </nav>
    </AdminPage>
  );
}
