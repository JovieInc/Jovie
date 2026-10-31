import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { OperatorRouteTabs } from '@/components/features/admin/layout/OperatorRouteTabs';
import { ADMIN_WORKSPACE_TABS } from '@/constants/admin-navigation';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { ShippedByArea } from './ShippedByArea';
import { ShippingMatrix } from './ShippingMatrix';
import { ShippingStatistics } from './ShippingStatistics';

export const metadata: Metadata = {
  title: 'Shipping | Ovie',
  robots: NOINDEX_ROBOTS,
};
export const dynamic = 'force-dynamic';

export default async function ShippingPage() {
  await requireCurrentAdminPageAccess();
  return (
    <AdminPage
      title='Shipping'
      description='Live PR and merge-queue status matrix.'
      testId='ovie-shipping-page'
    >
      <OperatorRouteTabs
        tabs={ADMIN_WORKSPACE_TABS.shipping}
        label='Shipping Views'
      />
      <ShippingMatrix />
      <ShippingStatistics />
      <ShippedByArea />
    </AdminPage>
  );
}
