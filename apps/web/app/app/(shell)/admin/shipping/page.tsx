import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
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
      <ShippingMatrix />
      <ShippingStatistics />
    </AdminPage>
  );
}
