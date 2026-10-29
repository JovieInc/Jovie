import type { Metadata } from 'next';
import { CapacityBoard } from '@/components/features/admin/capacity/CapacityBoard';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { getAdminCapacity } from '@/lib/admin/capacity';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getSidebarRouteLabel } from '@/lib/constants/sidebar-route-labels';

export const metadata: Metadata = {
  title: getSidebarRouteLabel(APP_ROUTES.ADMIN_CAPACITY, 'ov'),
};

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
  const capacity = await getAdminCapacity(now);

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
    </AdminPage>
  );
}
