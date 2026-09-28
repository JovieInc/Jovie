import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
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
      description='Pipeline observations and source merge throughput.'
      testId='ovie-shipping-page'
    >
      <ShippingStatistics />
    </AdminPage>
  );
}
