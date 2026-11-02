import type { Metadata } from 'next';
import { CapacityBoard } from '@/components/features/admin/capacity/CapacityBoard';
import { FleetAuditPanel } from '@/components/features/admin/fleet-audit/FleetAuditPanel';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { getAdminCapacity } from '@/lib/admin/capacity';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getFleetAuditSummary } from '@/lib/ovie/fleet-audit.server';

export const metadata: Metadata = { title: 'Capacity | Ovie' };

export const runtime = 'nodejs';

interface CapacityPageProps {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

export default async function AdminCapacityPage({
  searchParams,
}: Readonly<CapacityPageProps>) {
  await requireCurrentAdminPageAccess();
  const params = (await searchParams) ?? {};
  const requested = Array.isArray(params.provider)
    ? params.provider[0]
    : params.provider;
  const now = Date.now();
  const [capacity, fleetAudit] = await Promise.all([
    getAdminCapacity(now),
    getFleetAuditSummary(),
  ]);

  return (
    <AdminPage
      title='Capacity'
      layout='document'
      description='Every agent provider in one registry: plan, cost, remaining quota or credits, reset or expiry, and pace.'
      testId='admin-capacity-page'
    >
      <CapacityBoard
        view={capacity.view}
        order={capacity.order}
        selectedId={requested ?? null}
        basePath={APP_ROUTES.ADMIN_CAPACITY}
        now={now}
        registryUpdatedAt={capacity.registryUpdatedAt}
        liveOverlay={capacity.liveOverlay}
      />
      <FleetAuditPanel initial={fleetAudit} />
    </AdminPage>
  );
}
