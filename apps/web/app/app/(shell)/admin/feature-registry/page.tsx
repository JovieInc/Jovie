import type { Metadata } from 'next';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { loadFeatureRegistrySource } from '@/lib/admin/feature-registry.server';
import { buildFeatureReviewItems } from '@/lib/admin/founder-review-registry';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = {
  title: 'Feature Registry | Ovie',
};

export default async function FeatureRegistryPage() {
  await requireCurrentAdminPageAccess();
  const { markdown } = await loadFeatureRegistrySource();
  const items = buildFeatureReviewItems(markdown);

  return (
    <AdminPage
      title='Feature Registry'
      description='Canonical Jovie capabilities with attached evidence and founder taste certification.'
      testId='admin-feature-registry-page'
    >
      <FounderReviewRegistry kind='feature' items={items} />
    </AdminPage>
  );
}
